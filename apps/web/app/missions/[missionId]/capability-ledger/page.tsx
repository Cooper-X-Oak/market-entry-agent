import { Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { CommandButton } from '@/components/command-button';
import { ClaimEditor } from '@/components/claim-editor';
import { DataTable } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { SourceManager } from '@/components/source-manager';
import { Confidence, StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Claim, SourceRecord } from '@/lib/types';

export default async function CapabilityLedgerPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const [claimResult, sourceResult] = await Promise.all([safeApi<Claim[]>(`/api/v1/missions/${missionId}/capabilities`), safeApi<SourceRecord[]>(`/api/v1/missions/${missionId}/sources`)]);
  if (claimResult.error) return <ErrorState message={claimResult.error.message} />;
  const claims = claimResult.data ?? [];
  return <><PageHeader title="企业能力证据账本" description="查看系统当前掌握的企业能力事实、推断、未知项与矛盾。用户确认的声明会成为本任务当前事实。" actions={<CommandButton path={`/api/v1/missions/${missionId}/capabilities/research`} label="重新提取" className="button button-secondary" />} /><SourceManager missionId={missionId} sources={sourceResult.data ?? []} /><div style={{ height: 18 }} /><div className="split-layout"><Panel title="能力声明" description={`当前 ${claims.length} 条声明`} noPadding><DataTable rows={claims} getRowKey={(claim) => claim.id} columns={[{ key: 'claim', label: '声明', render: (claim) => <div><div className="cell-primary">{claim.statement}</div><div className="cell-secondary">{claim.claimType} · 影响 {claim.impactLevel}</div></div> }, { key: 'state', label: '状态', render: (claim) => <StatusBadge value={claim.status} /> }, { key: 'confidence', label: '置信度', render: (claim) => <Confidence value={claim.confidence} /> }, { key: 'updated', label: '更新时间', render: (claim) => formatDate(claim.updatedAt) }, { key: 'actions', label: '操作', align: 'right', render: (claim) => <div className="row-actions"><ClaimEditor missionId={missionId} claim={claim} /><CommandButton path={`/api/v1/missions/${missionId}/capabilities/${claim.id}/confirm`} label="确认" className="button button-ghost" /><CommandButton path={`/api/v1/missions/${missionId}/capabilities/${claim.id}/contradict`} label="冲突" className="button button-ghost" /></div> }]} empty={<EmptyState title="尚未提取能力声明" description="启动任务并完成企业官网及资料解析后，这里会显示带来源的能力事实和未知项。" />} /></Panel><div className="stack"><Panel title="判断标签"><div className="stack"><LabelRow value="observed" description="来源直接支持的公开事实" /><LabelRow value="inferred" description="依据证据形成、仍需确认的推断" /><LabelRow value="unknown" description="影响路线但当前证据缺失" /><LabelRow value="contradicted" description="存在冲突证据或用户否决" /><LabelRow value="user_confirmed" description="用户锁定为当前任务事实" /></div></Panel><Panel title="用户操作说明"><div className="stack"><div><Check size={16} style={{ verticalAlign: '-3px', marginRight: 7 }} /><strong>确认</strong><div className="cell-secondary">将当前声明标记为 User Confirmed。</div></div><div><TriangleAlert size={16} style={{ verticalAlign: '-3px', marginRight: 7 }} /><strong>冲突</strong><div className="cell-secondary">保留原判断并标记矛盾，不直接删除历史。</div></div><div><RefreshCw size={16} style={{ verticalAlign: '-3px', marginRight: 7 }} /><strong>重新提取</strong><div className="cell-secondary">使用当前有效来源生成新的产物版本。</div></div></div></Panel></div></div></>;
}

function LabelRow({ value, description }: { value: string; description: string }) { return <div><StatusBadge value={value} /><div className="cell-secondary" style={{ marginTop: 5 }}>{description}</div></div>; }
