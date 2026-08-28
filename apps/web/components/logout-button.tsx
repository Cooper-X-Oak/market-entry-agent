'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout(): Promise<void> { setPending(true); try { await apiClient('/api/v1/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); } finally { setPending(false); } }
  return <button className="button button-ghost" type="button" disabled={pending} onClick={logout}><LogOut /><span>{pending ? '退出中…' : '退出'}</span></button>;
}
