import { Download } from 'lucide-react';
import Link from 'next/link';
import { CommandButton } from '@/components/command-button';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ActionCard, ActionCardRow } from '@/lib/types';

const groups = [
  { key: 'review', title: '待审批', description: '内容完成，等待负责人审批。' },
  { key: 'approved', title: '已批准待执行', description: '可以复制、导出或开始实际外联。' },
  { key: 'due', title: '今日到期', description: '到期日为今天且尚未执行。' },
  { key: 'follow_up', title: '待跟进', description: '已执行，等待下一次互动。' },
  { key: 'completed', title: '已完成', description: '已经执行并记录结果。' },
] as const;

function belongs(card: ActionCard, group: (typeof groups)[number]['key']): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (group === 'review') return card.status === 'review' || card.status === 'changes_requested';
  if (group === 'approved') return ['approved', 'exported'].includes(card.status) && card.dueAt?.slice(0, 10) !== today;
  if (group === 'due') return card.status !== 'executed' && card.dueAt?.slice(0, 10) === today;
  if (group === 'follow_up') return card.status === 'executed' && Array.isArray(card.followUpPlan) && card.followUpPlan.length > 0;
  return card.status === 'executed';
}

export default async function ActionQueuePage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const result = await safeApi<ActionCardRow[]>(`/api/v1/missions/${missionId}/action-cards`);
  if (result.error) return <ErrorState message={result.error.message} />;
  const rows = result.data ?? [];
  return <><PageHeader title="行动队列" description="审批、执行并记录每个市场进入动作。只有已批准的行动卡可以标记为已执行。" actions={<a className="button button-secondary" href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1/missions/${missionId}/export`}><Download />导出完整任务</a>} />
    {rows.length === 0 ? <Panel><EmptyState title="暂无行动卡" description="机会通过 Action Card Gate 后，系统会在这里生成可执行的联系内容。" actionLabel="查看机会" actionHref={`/missions/${missionId}/opportunities`} /></Panel> : <div className="stack">{groups.map((group) => { const grouped = rows.filter(({ actionCard }) => belongs(actionCard, group.key)); return <Panel key={group.key} title={`${group.title} · ${grouped.length}`} description={group.description}>{grouped.length === 0 ? <div className="cell-secondary">当前分组没有行动卡。</div> : grouped.map(({ actionCard: card, opportunity }) => <article key={card.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(220px, 1fr) auto', gap: 18, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}><div><Link className="cell-link" href={`/missions/${missionId}/action-queue/${card.id}`}>{card.objective}</Link><div className="cell-secondary">{opportunity.title} · {card.channel} · 版本 {card.versionNo}</div></div><div><div className="cell-primary">{card.contactReason}</div><div className="cell-secondary">负责人：{card.ownerId ?? '未分配'} · 到期：{formatDate(card.dueAt)}</div></div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}><StatusBadge value={card.status} />{card.status === 'review' && <CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/approve`} label="批准" className="button button-primary" />}{card.status === 'approved' && <CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/execute`} label="标记已执行" className="button button-secondary" confirmText="确认已完成实际外联？" />}</div></article>)}</Panel>; })}</div>}
  </>;
}
