import { Download } from 'lucide-react';
import { EcosystemGraph } from '@/components/ecosystem-graph';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import type { EntityRow, Relationship } from '@/lib/types';

export default async function EcosystemPage({ params }: { params: Promise<{ missionId: string }> }) { const { missionId } = await params; const [entityResult, relationResult] = await Promise.all([safeApi<EntityRow[]>(`/api/v1/missions/${missionId}/entities`), safeApi<Relationship[]>(`/api/v1/missions/${missionId}/relationships`)]); if (entityResult.error) return <ErrorState message={entityResult.error.message} />; const entityRows = entityResult.data ?? []; const relationships = relationResult.data ?? []; return <><PageHeader title="产业生态与组织图谱" description="围绕已批准路线查看组织、人员、项目、协会、展会与公开业务关系。节点和关系只表示当前证据支持的市场结构。" actions={<button className="button button-secondary"><Download />导出实体与关系</button>} /><Panel title="生态图谱" description={`${entityRows.length} 个实体 · ${relationships.length} 条关系`} noPadding>{entityRows.length === 0 ? <EmptyState title="生态图谱尚未生成" description="批准市场路线后，系统会围绕路线发现实体、关系和公开项目。" /> : <EcosystemGraph entities={entityRows} relationships={relationships} />}</Panel><div style={{ height: 18 }} /><Panel title="实体类型概览"><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{Object.entries(entityRows.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.entity.entityType]: (counts[row.entity.entityType] ?? 0) + 1 }), {})).map(([type, count]) => <span key={type} className="badge badge-neutral">{type} · {count}</span>)}{entityRows.length === 0 && <StatusBadge value="unknown" />}</div></Panel></>; }
