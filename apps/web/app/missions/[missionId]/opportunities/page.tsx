import { Download, LayoutGrid, List } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { Opportunity } from '@/lib/types';

const columns = ['target_identified','stakeholder_mapped','contact_path_found','contact_path_verified','action_ready','approved','contacted','responded','qualified'] as const;
const labels: Record<string, string> = { target_identified: 'Target Identified', stakeholder_mapped: 'Stakeholder Mapped', contact_path_found: 'Contact Found', contact_path_verified: 'Contact Verified', action_ready: 'Action Ready', approved: 'Approved', contacted: 'Contacted', responded: 'Responded', qualified: 'Qualified' };

export default async function OpportunitiesPage({ params }: { params: Promise<{ missionId: string }> }) { const { missionId } = await params; const result = await safeApi<Opportunity[]>(`/api/v1/missions/${missionId}/opportunities`); if (result.error) return <ErrorState message={result.error.message} />; const opportunities = result.data ?? []; return <><PageHeader title="市场进入机会" description="机会表示一个已具备市场意义、明确利益角色与触达路径的目标。看板展示从目标识别到资格确认的推进状态。" actions={<><button className="button button-secondary"><LayoutGrid />看板</button><button className="button button-ghost"><List />表格</button><button className="button button-secondary"><Download />导出</button></>} /><Panel noPadding>{opportunities.length === 0 ? <EmptyState title="尚未创建机会" description="从目标组织页面提升优先级并创建机会后，这里会显示资格判断与下一步动作。" /> : <div className="panel-body"><div className="kanban">{columns.map((status) => { const rows = opportunities.filter((opportunity) => opportunity.status === status); return <section className="kanban-column" key={status}><header className="kanban-header"><span>{labels[status]}</span><span>{rows.length}</span></header><div className="kanban-list">{rows.map((opportunity) => <article className="opportunity-card" key={opportunity.id}><Link href={`/missions/${missionId}/opportunities/${opportunity.id}`}><h4>{opportunity.title}</h4></Link><p>{opportunity.nextAction}</p><div className="opportunity-meta"><StatusBadge value={opportunity.priority} /><strong>{opportunity.score}</strong></div><div className="cell-secondary" style={{ marginTop: 9 }}>价值 {opportunity.commercialValueBand} · 效率 {formatNumber(opportunity.resourceEfficiency)}</div></article>)}</div></section>; })}</div></div>}</Panel></>; }
