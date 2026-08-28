import { cookies } from 'next/headers';
import type { ApiFailure, ApiResult } from './api-types';

export type { ApiFailure, ApiResult } from './api-types';

const serverApiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(`${serverApiBase}${path}`, { ...init, headers: { accept: 'application/json', cookie: cookieStore.toString(), ...init?.headers }, cache: 'no-store' });
  const payload = await response.json() as { data?: T; error?: ApiFailure };
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `API request failed with ${response.status}`);
  return payload.data as T;
}

export async function safeApi<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try { return { data: await api<T>(path, init), error: null }; }
  catch (error) { return { data: null, error: { code: 'API_UNAVAILABLE', message: error instanceof Error ? error.message : '请求失败' } }; }
}
