import { redirect } from 'next/navigation';
import { safeApi } from './api';

export async function requireAuth(): Promise<void> {
  const result = await safeApi<unknown>('/api/v1/auth/me');
  if (!result.data) redirect('/login');
}
