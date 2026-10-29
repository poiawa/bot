/**
 * VPN Panel Adapter Interface
 *
 * Every panel adapter must implement this interface and declare its
 * capabilities explicitly. An adapter must NEVER claim an operation is
 * supported when the underlying panel API does not support it.
 */

export interface PanelCredentials {
  apiUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  /** Extra headers required by some panels */
  extraHeaders?: Record<string, string>;
}

export interface PanelCapabilities {
  createSubscription: boolean;
  getSubscription: boolean;
  renewSubscription: boolean;
  changeDataLimit: boolean;
  changeExpiry: boolean;
  resetUsage: boolean;
  setEnabled: boolean;
  deleteSubscription: boolean;
  getSubscriptionUrls: boolean;
  changeSubscriptionUrls: boolean;
  transferSubscription: boolean;
  getUsage: boolean;
  getServerHealth: boolean;
  listInbounds: boolean;
  supportedProtocols: string[];
  supportedTransports: string[];
  supportedVersions: string[];
}

export interface SubscriptionSpec {
  username: string;
  dataLimitGb?: number;
  /** Duration in days from creation; panels that require an absolute expiry
   *  date will convert internally. */
  durationDays?: number;
  expireAt?: Date;
  inboundIds?: string[];
  note?: string;
}

export interface SubscriptionInfo {
  providerId: string;
  username: string;
  status: 'active' | 'expired' | 'disabled' | 'limited';
  dataLimitGb: number | null;
  usedDataGb: number | null;
  /** null means the panel did not report usage (unknown), not zero */
  expiresAt: Date | null;
  subscriptionUrl: string | null;
  raw: unknown;
}

/** Unified, meaningful errors converted from provider errors */
export class PanelError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'AUTH_FAILED'
      | 'NOT_FOUND'
      | 'USERNAME_TAKEN'
      | 'CAPACITY_EXCEEDED'
      | 'TIMEOUT'
      | 'RATE_LIMITED'
      | 'API_ERROR'
      | 'NETWORK_ERROR'
      | 'UNSUPPORTED_OPERATION',
    public readonly providerStatus?: number,
    public readonly providerDetail?: unknown
  ) {
    super(message);
    this.name = 'PanelError';
  }
}

export interface VpnPanelAdapter {
  readonly panelType: string;
  readonly capabilities: PanelCapabilities;

  /** Test connection and authentication. Returns panel version info. */
  testConnection(): Promise<{ ok: true; version: string | null } | { ok: false; error: string }>;

  /** Retrieve panel/system information. */
  getPanelInfo(): Promise<Record<string, unknown>>;

  /** List available inbounds (protocols/ports) on the panel. */
  listInbounds(): Promise<Array<{ id: string; protocol: string; port: number; tag?: string }>>;

  /** Create a subscription. Must be idempotent: creating twice with the
   *  same username should either succeed identically or fail with
   *  USERNAME_TAKEN — never create a duplicate entity. */
  createSubscription(spec: SubscriptionSpec): Promise<SubscriptionInfo>;

  /** Retrieve subscription details from the panel. */
  getSubscription(username: string): Promise<SubscriptionInfo>;

  /** Renew: extend expiry and/or increase data limit. */
  renewSubscription(username: string, spec: SubscriptionSpec): Promise<SubscriptionInfo>;

  /** Change data limit (in GB). */
  changeDataLimit(username: string, dataLimitGb: number): Promise<SubscriptionInfo>;

  /** Change expiry to an absolute date. */
  changeExpiry(username: string, expireAt: Date): Promise<SubscriptionInfo>;

  /** Reset used traffic to zero, if supported. */
  resetUsage(username: string): Promise<SubscriptionInfo>;

  /** Enable or disable the subscription. */
  setEnabled(username: string, enabled: boolean): Promise<SubscriptionInfo>;

  /** Delete the subscription permanently. */
  deleteSubscription(username: string): Promise<void>;

  /** Fetch current usage. */
  getUsage(username: string): Promise<{ usedDataGb: number | null; dataLimitGb: number | null }>;

  /** Node/server health, if supported. */
  getServerHealth(): Promise<Array<{ node: string; status: string; detail?: unknown }>>;
}

/** Helper for adapters: throw for unsupported operations */
export function unsupported(adapter: string, op: string): never {
  throw new PanelError(
    `Operation "${op}" is not supported by the ${adapter} adapter`,
    'UNSUPPORTED_OPERATION'
  );
}
