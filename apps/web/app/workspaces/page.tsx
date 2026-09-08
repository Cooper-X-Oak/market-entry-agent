import { ErrorState } from '@/components/states';
import { WorkspacePicker, type WorkspaceOption } from '@/components/workspace-picker';
import { safeApi } from '@/lib/api';

export default async function WorkspacesPage() {
  const result = await safeApi<WorkspaceOption[]>('/api/v1/auth/workspaces');
  return <main className="auth-shell"><section className="auth-form-side">{result.data ? <WorkspacePicker workspaces={result.data} /> : <ErrorState message={result.error?.message ?? '无法读取工作区'} />}</section><section className="auth-context"><div><h2>先确定数据边界，再开始工作。</h2><p>工作区选择会同时确定 Tenant、成员角色、数据库 RLS 和后续全部 Mission 的访问范围。</p></div><div className="auth-proof"><div><strong>Tenant</strong><span>数据隔离边界</span></div><div><strong>Role</strong><span>Owner / Editor / Viewer</span></div><div><strong>Session</strong><span>角色变更立即生效</span></div></div></section></main>;
}
