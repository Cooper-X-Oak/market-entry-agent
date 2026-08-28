import { CommandButton } from '@/components/command-button';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import type { RefreshProposal } from '@/lib/types';

export default async function RefreshCenterPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const result = await safeApi<RefreshProposal[]>(`/api/v1/missions/${missionId}/refresh-proposals`);
  if (result.error) return <ErrorState message={result.error.message} />;
  const proposals = result.data ?? [];
  return <><PageHeader title="刷新中心" description="每周刷新只生成变化建议；用户接受后才替换当前生效版本。" actions={<CommandButton path={`/api/v1/missions/${missionId}/refresh`} label="立即刷新" className="button button-primary" />} />{proposals.length === 0 ? <Panel><EmptyState title="暂无变化建议" description="首次刷新或每周计划完成后，新证据、联系变化和机会重排会在这里等待处理。" /></Panel> : <div className="stack">{proposals.map(({ artifact, version }) => <Panel key={version.id} title={artifact.title} description={`${artifact.artifactType} · 建议版本 ${version.versionNo}`} action={<StatusBadge value={version.status} />}><div className="split-layout" style={{ marginTop: 0 }}><div><div className="cell-secondary">变化摘要</div><p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{version.summary}</p><details><summary className="cell-link">查看变化载荷</summary><pre style={{ margin: '12px 0 0', padding: 14, overflow: 'auto', background: 'var(--surface-muted)', borderRadius: 8, fontSize: 12 }}>{JSON.stringify(version.payload, null, 2)}</pre></details></div><div className="stack"><CommandButton path={`/api/v1/missions/${missionId}/refresh-proposals/${version.id}/accept`} label="接受更新" className="button button-primary" /><CommandButton path={`/api/v1/missions/${missionId}/refresh-proposals/${version.id}/research`} label="请求补充研究" className="button button-secondary" /><CommandButton path={`/api/v1/missions/${missionId}/refresh-proposals/${version.id}/defer`} label="稍后处理" className="button button-ghost" /></div></div></Panel>)}</div>}</>;
}
