import { Cpu, Download } from 'lucide-react';
import { DataTable, type TableColumn } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { RunItem } from '@/lib/types';

const columns: Array<TableColumn<RunItem>> = [
  { key: 'type', label: '运行类型 / Agent Skill', render: (run) => <div><div className="cell-primary">{run.runType}</div><div className="cell-secondary">{run.skillKey}</div></div> },
  { key: 'status', label: '状态', render: (run) => <StatusBadge value={run.status} /> },
  { key: 'model', label: '模型', render: (run) => <span>{run.modelName}</span> },
  { key: 'context', label: 'Context / Prompt', render: (run) => <div><div className="cell-primary">Context v{run.contextVersion} · Prompt v{run.promptVersion ?? '—'}</div><div className="cell-secondary" title={run.inputContextHash}>{run.inputContextHash.slice(0, 12)}… · 证据 {run.evidenceItemIds.length} · 工具 {run.toolRuns.length}</div></div> },
  { key: 'tokens', label: 'Token', align: 'right', render: (run) => <div><div className="cell-primary">{formatNumber(run.inputTokens + run.outputTokens)}</div><div className="cell-secondary">入 {formatNumber(run.inputTokens)} / 出 {formatNumber(run.outputTokens)}</div></div> },
  { key: 'cost', label: '成本', align: 'right', render: (run) => <span>USD {formatNumber(run.costAmount)}</span> },
  { key: 'duration', label: '耗时', align: 'right', render: (run) => <span>{run.durationMs ? `${formatNumber(run.durationMs / 1000)} s` : '—'}</span> },
  { key: 'start', label: '开始时间', render: (run) => <span>{formatDate(run.startedAt)}</span> },
  { key: 'error', label: '错误信息', render: (run) => <span className={run.errorMessage ? 'text-danger' : 'cell-secondary'}>{run.errorMessage ?? '—'}</span> },
];

export default async function RunsPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const result = await safeApi<RunItem[]>(`/api/v1/missions/${missionId}/runs`);
  if (result.error) return <ErrorState message={result.error.message} />;
  const runs = result.data ?? [];
  const tokens = runs.reduce((total, run) => total + run.inputTokens + run.outputTokens, 0);
  const cost = runs.reduce((total, run) => total + Number(run.costAmount), 0);
  return <><PageHeader title="运行记录" description={`共 ${runs.length} 次运行 · ${formatNumber(tokens)} Token · USD ${formatNumber(cost)}`} actions={<button className="button button-secondary"><Download />导出运行记录</button>} /><Panel noPadding><DataTable columns={columns} rows={runs} getRowKey={(run) => run.runId} toolbar={<div className="toolbar"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Cpu size={17} /><strong>Agent 与工具运行</strong></div><div className="toolbar-spacer" /><span className="cell-secondary">输入产物与输出产物可在运行详情中追溯</span></div>} empty={<EmptyState title="暂无运行记录" description="任务进入编译或研究阶段后会记录 Agent、模型、成本和耗时。" />} /></Panel></>;
}
