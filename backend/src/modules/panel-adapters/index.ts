/**
 * Panel adapter registry.
 * Creates the correct adapter for a stored panel connection and
 * decrypts credentials only in memory.
 */
import { VpnPanelAdapter, PanelError } from './types.js';
import { MarzbanAdapter } from './marzban.js';
import { decryptFromStorage } from '../../core/crypto/index.js';

export interface StoredPanelConnection {
  id: string;
  name: string;
  type: string;
  apiUrl: string;
  username: string | null; // encrypted at rest
  passwordHash: string | null; // encrypted at rest (named *_hash for schema compat)
  apiKeyHash: string | null;
  isEnabled: boolean;
}

export function createAdapter(panel: StoredPanelConnection): VpnPanelAdapter {
  if (!panel.isEnabled) {
    // Still allow construction; callers decide whether to use it.
    // Sale allocation logic must skip disabled panels.
  }
  switch (panel.type) {
    case 'marzban': {
      if (!panel.username || !panel.passwordHash) {
        throw new PanelError(`Panel "${panel.name}" is missing credentials`, 'API_ERROR');
      }
      return MarzbanAdapter.fromEncrypted(panel.apiUrl, panel.username, panel.passwordHash);
    }
    case 'marzneshin':
    case 'remnawave':
    case 'pasarguard':
    case '3x_ui':
    case 'hiddify':
    case 'other':
      throw new PanelError(
        `Adapter for panel type "${panel.type}" is not implemented yet. ` +
        `Only "marzban" is currently implemented and tested.`,
        'UNSUPPORTED_OPERATION'
      );
    default:
      throw new PanelError(`Unknown panel type: ${panel.type}`, 'UNSUPPORTED_OPERATION');
  }
}

/** List of panel types that have real adapters */
export const implementedAdapters = ['marzban'] as const;
