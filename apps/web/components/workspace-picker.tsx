'use client';

import { Building2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface WorkspaceOption {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'editor' | 'viewer';
}

export function WorkspacePicker({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState('');

  async function select(workspaceId: string): Promise<void> {
    setPendingId(workspaceId);
    setError('');
    try {
      await apiClient('/api/v1/auth/select-workspace', { method: 'POST', body: JSON.stringify({ workspaceId }) });
      window.location.assign('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '工作区选择失败');
      setPendingId(undefined);
    }
  }

  return <div className="auth-form"><Building2 size={34} /><h1>选择工作区</h1><p>本次会话中的任务、权限和数据都以所选工作区为边界。</p><div className="stack">{workspaces.map((workspace) => <button key={workspace.id} className="button button-secondary" style={{ minHeight: 58, justifyContent: 'space-between' }} disabled={Boolean(pendingId)} onClick={() => void select(workspace.id)}><span style={{ textAlign: 'left' }}><strong style={{ display: 'block' }}>{workspace.name}</strong><span className="cell-secondary">{workspace.slug} · {workspace.role}</span></span><span><LogIn size={17} /> {pendingId === workspace.id ? '正在进入…' : '进入工作区'}</span></button>)}{workspaces.length === 0 && <div className="error-state">当前账户没有可用的工作区成员资格。</div>}{error && <div className="error-state" role="alert">{error}</div>}</div></div>;
}
