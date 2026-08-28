import type { ApiFailure } from './api-types';

export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init?.body && !isFormData ? { 'content-type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json() as { data?: T; error?: ApiFailure };
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `请求失败 (${response.status})`);
  return payload.data as T;
}
