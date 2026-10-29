/**
 * Shared HTTP client for panel adapters.
 * - Bounded timeouts
 * - Bounded retries with exponential backoff (temporary errors only)
 * - Converts network/HTTP failures into PanelError
 */
import { PanelError } from './types.js';

export interface HttpResult<T = unknown> {
  status: number;
  data: T | null;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function panelRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  body?: unknown,
  opts: { timeoutMs?: number; maxAttempts?: number } = {}
): Promise<HttpResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  let lastError: PanelError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);

      if (isRetryable(res.status) && attempt < maxAttempts) {
        lastError = new PanelError(
          `Provider returned ${res.status}`,
          res.status === 429 ? 'RATE_LIMITED' : 'API_ERROR',
          res.status
        );
        await sleep(Math.pow(2, attempt) * 500);
        continue;
      }

      let data: T | null = null;
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          data = text as unknown as T;
        }
      }
      return { status: res.status, data };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      lastError = new PanelError(
        isTimeout ? `Request to panel timed out after ${timeoutMs}ms` : `Network error: ${err instanceof Error ? err.message : 'unknown'}`,
        isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR'
      );
      if (attempt < maxAttempts) {
        await sleep(Math.pow(2, attempt) * 500);
        continue;
      }
    }
  }

  throw lastError ?? new PanelError('Request failed', 'NETWORK_ERROR');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build Authorization headers from credentials */
export function authHeaders(token?: string, apiKey?: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (apiKey) headers['Authorization'] = apiKey;
  return headers;
}
