/**
 * Minimal typed API client.
 * Auth token is attached from localStorage; 401 clears the session.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
  }
  try {
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return { success: false, error: `HTTP ${res.status}` };
  }
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
};
