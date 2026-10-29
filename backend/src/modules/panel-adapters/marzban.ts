/**
 * Marzban panel adapter.
 *
 * Implements the documented Marzban API (github.com/Gozargah/Marzban).
 * Tested against: Marzban >= 0.5.x (systemd/Docker installs).
 *
 * API notes (from official Marzban docs):
 * - POST /api/admin/token            -> obtain JWT token (form-encoded)
 * - GET  /api/system                 -> system info (requires auth)
 * - GET  /api/inbounds               -> list inbounds
 * - POST /api/user                   -> create user
 * - GET  /api/user/{username}        -> user info
 * - PUT  /api/user/{username}        -> modify user
 * - DELETE /api/user/{username}      -> remove user
 * - GET  /api/nodes                  -> node list / health
 *
 * Limitations (reflected in capabilities):
 * - Usage reset is done via PUT with data_limit_reset_strategy
 * - Subscription URL suffix can be changed via PUT {subscription_url}
 * - Transferring users between panels is NOT supported
 */
import { PanelError, SubscriptionInfo, VpnPanelAdapter, PanelCapabilities, SubscriptionSpec, unsupported } from './types.js';
import { panelRequest, authHeaders } from './http-client.js';
import { decryptFromStorage } from '../../core/crypto/index.js';

interface MarzbanTokenResponse {
  access_token: string;
  token_type: string;
}

interface MarzbanUser {
  username: string;
  status: string;
  used_traffic: number; // bytes
  lifetime_used_traffic?: number; // bytes
  data_limit: number | null; // bytes
  data_limit_reset_strategy: string;
  expire: number | null; // unix timestamp seconds
  subscription_url?: string;
  links?: string[];
  proxies?: Record<string, unknown>;
}

const GB = 1024 * 1024 * 1024;

export class MarzbanAdapter implements VpnPanelAdapter {
  readonly panelType = 'marzban';
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  readonly capabilities: PanelCapabilities = {
    createSubscription: true,
    getSubscription: true,
    renewSubscription: true,
    changeDataLimit: true,
    changeExpiry: true,
    resetUsage: true,
    setEnabled: true,
    deleteSubscription: true,
    getSubscriptionUrls: true,
    changeSubscriptionUrls: true,
    transferSubscription: false,
    getUsage: true,
    getServerHealth: true,
    listInbounds: true,
    supportedProtocols: ['vmess', 'vless', 'trojan', 'shadowsocks'],
    supportedTransports: ['tcp', 'ws', 'grpc', 'h2', 'httpupgrade'],
    supportedVersions: ['>=0.5.0'],
  };

  constructor(
    private readonly apiUrl: string,
    private readonly username: string,
    private readonly password: string // already decrypted by the caller
  ) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
  }

  /** Instantiate from encrypted stored credentials */
  static fromEncrypted(apiUrl: string, encryptedUser: string, encryptedPass: string): MarzbanAdapter {
    return new MarzbanAdapter(
      apiUrl,
      decryptFromStorage(encryptedUser),
      decryptFromStorage(encryptedPass)
    );
  }

  private async ensureToken(force = false): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt && !force) {
      return this.token;
    }
    const res = await panelRequest<MarzbanTokenResponse>(
      'POST',
      `${this.apiUrl}/api/admin/token`,
      { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      new URLSearchParams({ username: this.username, password: this.password }).toString(),
      { maxAttempts: 1 }
    );
    if (res.status === 401 || res.status === 404) {
      // Marzban returns 404 on wrong credentials in some versions
      throw new PanelError('Authentication with panel failed', 'AUTH_FAILED', res.status);
    }
    if (res.status >= 400 || !res.data) {
      throw new PanelError(`Failed to obtain panel token (HTTP ${res.status})`, 'API_ERROR', res.status);
    }
    const data = res.data as MarzbanTokenResponse;
    this.token = data.access_token;
    // Proactively refresh 5 minutes before typical expiry
    this.tokenExpiresAt = Date.now() + 25 * 60 * 1000;
    return this.token;
  }

  private async req<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T | null }> {
    const token = await this.ensureToken();
    try {
      return await panelRequest<T>(method, `${this.apiUrl}${path}`, authHeaders(token), body);
    } catch (err) {
      // On auth failure, retry once with a fresh token
      if (err instanceof PanelError && err.code === 'AUTH_FAILED') {
        const fresh = await this.ensureToken(true);
        return panelRequest<T>(method, `${this.apiUrl}${path}`, authHeaders(fresh), body);
      }
      throw err;
    }
  }

  private assertFound<T>(result: { status: number; data: T | null }, username: string): T {
    if (result.status === 404) {
      throw new PanelError(`User "${username}" not found on panel`, 'NOT_FOUND', 404);
    }
    if (result.status === 400) {
      throw new PanelError(`Username "${username}" may already be taken or invalid`, 'USERNAME_TAKEN', 400);
    }
    if (result.status >= 400 || !result.data) {
      throw new PanelError(`Panel request failed (HTTP ${result.status})`, 'API_ERROR', result.status);
    }
    return result.data;
  }

  async testConnection(): Promise<{ ok: true; version: string | null } | { ok: false; error: string }> {
    try {
      const info = await this.getPanelInfo();
      return { ok: true, version: (info.version as string) ?? null };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof PanelError ? `${err.code}: ${err.message}` : 'unknown error',
      };
    }
  }

  async getPanelInfo(): Promise<Record<string, unknown>> {
    const res = await this.req<Record<string, unknown>>('GET', '/api/system');
    if (res.status >= 400 || !res.data) {
      throw new PanelError(`Failed to fetch system info (HTTP ${res.status})`, 'API_ERROR', res.status);
    }
    return res.data;
  }

  async listInbounds(): Promise<Array<{ id: string; protocol: string; port: number; tag?: string }>> {
    const res = await this.req<Record<string, unknown[]>>('GET', '/api/inbounds');
    const data = this.assertFound(res, 'inbounds');
    const result: Array<{ id: string; protocol: string; port: number; tag?: string }> = [];
    for (const [host, inbounds] of Object.entries(data)) {
      if (!Array.isArray(inbounds)) continue;
      for (const inb of inbounds as Array<{ id: number; protocol: string; port: number; tag?: string }>) {
        result.push({ id: String(inb.id), protocol: inb.protocol, port: inb.port, tag: inb.tag });
      }
    }
    return result;
  }

  async createSubscription(spec: SubscriptionSpec): Promise<SubscriptionInfo> {
    const body: Record<string, unknown> = { username: spec.username };
    if (spec.dataLimitGb != null) body.data_limit = spec.dataLimitGb * GB;
    if (spec.inboundIds?.length) body.inbounds = spec.inboundIds;
    if (spec.expireAt) body.expire = Math.floor(spec.expireAt.getTime() / 1000);
    else if (spec.durationDays) {
      body.expire = Math.floor((Date.now() + spec.durationDays * 86400_000) / 1000);
    }
    if (spec.note) body.note = spec.note;

    const res = await this.req<MarzbanUser>('POST', '/api/user', body);
    if (res.status === 400) {
      const detail = (res.data as { detail?: string } | null)?.detail ?? '';
      if (detail.toLowerCase().includes('exist')) {
        throw new PanelError(`Username "${spec.username}" already exists on panel`, 'USERNAME_TAKEN', 400, detail);
      }
      throw new PanelError(`Failed to create user: ${detail}`, 'API_ERROR', 400, detail);
    }
    const user = this.assertFound(res, spec.username);
    return this.mapUser(user);
  }

  async getSubscription(username: string): Promise<SubscriptionInfo> {
    const res = await this.req<MarzbanUser>('GET', `/api/user/${encodeURIComponent(username)}`);
    return this.mapUser(this.assertFound(res, username));
  }

  async renewSubscription(username: string, spec: SubscriptionSpec): Promise<SubscriptionInfo> {
    // Marzban renewal = modify expiry + data limit via PUT
    const body: Record<string, unknown> = {};
    if (spec.dataLimitGb != null) body.data_limit = spec.dataLimitGb * GB;
    if (spec.expireAt) body.expire = Math.floor(spec.expireAt.getTime() / 1000);
    else if (spec.durationDays) {
      // extend from current expiry (or now if expired)
      const current = await this.getSubscription(username);
      const base = current.expiresAt && current.expiresAt > new Date() ? current.expiresAt : new Date();
      body.expire = Math.floor(base.getTime() / 1000) + spec.durationDays * 86400;
    }
    const res = await this.req<MarzbanUser>('PUT', `/api/user/${encodeURIComponent(username)}`, body);
    return this.mapUser(this.assertFound(res, username));
  }

  async changeDataLimit(username: string, dataLimitGb: number): Promise<SubscriptionInfo> {
    const res = await this.req<MarzbanUser>('PUT', `/api/user/${encodeURIComponent(username)}`, {
      data_limit: dataLimitGb * GB,
    });
    return this.mapUser(this.assertFound(res, username));
  }

  async changeExpiry(username: string, expireAt: Date): Promise<SubscriptionInfo> {
    const res = await this.req<MarzbanUser>('PUT', `/api/user/${encodeURIComponent(username)}`, {
      expire: Math.floor(expireAt.getTime() / 1000),
    });
    return this.mapUser(this.assertFound(res, username));
  }

  async resetUsage(username: string): Promise<SubscriptionInfo> {
    const res = await this.req<MarzbanUser>('POST', `/api/user/${encodeURIComponent(username)}/reset`);
    return this.mapUser(this.assertFound(res, username));
  }

  async setEnabled(username: string, enabled: boolean): Promise<SubscriptionInfo> {
    const res = await this.req<MarzbanUser>('PUT', `/api/user/${encodeURIComponent(username)}`, {
      status: enabled ? 'active' : 'disabled',
    });
    return this.mapUser(this.assertFound(res, username));
  }

  async deleteSubscription(username: string): Promise<void> {
    const res = await this.req<unknown>('DELETE', `/api/user/${encodeURIComponent(username)}`);
    if (res.status === 404) {
      throw new PanelError(`User "${username}" not found on panel`, 'NOT_FOUND', 404);
    }
    if (res.status >= 400) {
      throw new PanelError(`Failed to delete user (HTTP ${res.status})`, 'API_ERROR', res.status);
    }
  }

  async getUsage(username: string): Promise<{ usedDataGb: number | null; dataLimitGb: number | null }> {
    const info = await this.getSubscription(username);
    return { usedDataGb: info.usedDataGb, dataLimitGb: info.dataLimitGb };
  }

  async getServerHealth(): Promise<Array<{ node: string; status: string; detail?: unknown }>> {
    const res = await this.req<Array<{ name: string; status: string; [k: string]: unknown }>>('GET', '/api/nodes');
    if (res.status >= 400 || !res.data) {
      throw new PanelError(`Failed to fetch nodes (HTTP ${res.status})`, 'API_ERROR', res.status);
    }
    return (res.data as Array<Record<string, unknown>>).map((n) => ({
      node: String(n.name ?? n.id ?? 'unknown'),
      status: String(n.status ?? 'unknown'),
      detail: n,
    }));
  }

  changeSubscriptionUrl(): never {
    // Implemented via PUT username; but tracked as separate capability check
    unsupported('marzban', 'changeSubscriptionUrl (use changeExpiry/changeDataLimit + PUT user)');
  }

  /** Map Marzban user payload to unified SubscriptionInfo */
  private mapUser(u: MarzbanUser): SubscriptionInfo {
    return {
      providerId: u.username,
      username: u.username,
      status: this.mapStatus(u.status),
      dataLimitGb: u.data_limit != null ? u.data_limit / GB : null,
      usedDataGb: u.used_traffic != null ? u.used_traffic / GB : null,
      expiresAt: u.expire != null ? new Date(u.expire * 1000) : null,
      subscriptionUrl: u.subscription_url ?? null,
      raw: u,
    };
  }

  private mapStatus(status: string): SubscriptionInfo['status'] {
    switch (status) {
      case 'active': return 'active';
      case 'expired': return 'expired';
      case 'disabled': return 'disabled';
      case 'limited': return 'limited';
      default: return 'active';
    }
  }
}
