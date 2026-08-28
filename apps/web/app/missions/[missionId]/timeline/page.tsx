import { Activity, Bot, GitCommit, UserRound } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { TimelineItem } from '@/lib/types';

export default async function TimelinePage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const result = await safeApi<TimelineItem[]>(`/api/v1/missions/${missionId}/timeline`);
  if (result.error) return <ErrorState message={result.error.message} />;
  const events = result.data ?? [];
  const groups = [...events.reduce((map, event) => {
    const group = map.get(event.correlationId) ?? [];
    group.push(event);
    map.set(event.correlationId, group);
    return map;
  }, new Map<string, TimelineItem[]>()).entries()];
  return <><PageHeader title="决策时间线" description="按 correlationId 折叠一次业务动作产生的完整领域事件链。" /><Panel noPadding>{groups.length === 0 ? <EmptyState title="暂无时间线记录" description="任务启动后，投影器会把关键判断和状态变化写入此处。" /> : <div className="panel-body"><div className="timeline">{groups.map(([correlationId, chain]) => <details key={correlationId} open style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}><summary><strong>{chain[0]?.title ?? '业务动作'}</strong><span className="cell-secondary"> · {chain.length} 个事件 · {formatDate(chain[0]?.occurredAt)}</span></summary><div style={{ padding: '8px 0 0 18px' }}>{chain.map((event) => <article key={event.eventId} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', gap: 14, padding: '12px 0' }}><div style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--surface-muted)', color: 'var(--primary)' }}>{event.actorType === 'user' ? <UserRound size={17} /> : event.actorType === 'agent' ? <Bot size={17} /> : <Activity size={17} />}</div><div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><strong>{event.title}</strong><time className="cell-secondary">{formatDate(event.occurredAt)}</time></div><p style={{ margin: '5px 0 8px', color: 'var(--text-secondary)' }}>{event.summary}</p><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><StatusBadge value={event.eventType} /><span className="cell-secondary">{event.aggregateType} / v{event.aggregateVersion}</span><span className="cell-secondary"><GitCommit size={14} style={{ verticalAlign: '-2px' }} /> {event.eventId}</span>{event.evidenceRefs?.length > 0 && <span className="cell-secondary">证据 {event.evidenceRefs.length}</span>}</div></div></article>)}</div></details>)}</div></div>}</Panel></>;
}
