'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  async function logout(): Promise<void> { setPending(true); await apiClient('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined); window.location.replace('/login'); }
  return <button className="button button-ghost" type="button" disabled={pending} onClick={logout}><LogOut /><span>{pending ? '退出中…' : '退出'}</span></button>;
}
