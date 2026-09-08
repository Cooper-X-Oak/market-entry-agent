import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { DataTable } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/states';
import { MetricStrip, Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Mission, MissionMetrics } from '@/lib/types';

const decisionByStage: Record<string, { description: string; label: string; path: string }> = {
  awaiting_capability_review: {
    description: '企业能力研究已形成，等待确认公开证据支持的能力边界。',
    label: '确认能力边界',
    path: 'capability-ledger',
  },
  awaiting_route_review: {
    description: '市场路线研究已完成，等待批准一至三条进入路线。',
    label: '进入路线评审',
    path: 'market-routes',
  },
  awaiting_target_review: {
    description: '候选目标已完成排序，等待从前十名中选择一至三个目标。',
    label: '选择优先目标',
    path: 'targets',
  },
  awaiting_action_review: {
    description: '目标行动已经形成，等待批准首张外联或公开研究 Action Card。',
    label: '审批行动卡',
    path: 'action-queue',
  },
};

export default async function DashboardPage() {
  const result = await safeApi<Mission[]>('/api/v1/missions?page=1&pageSize=50');
  const missionRows = result.data ?? [];
  const metricRows = await Promise.all(
    missionRows.slice(0, 20).map(async (mission) => ({
      mission,
      metrics: (await safeApi<MissionMetrics>(`/api/v1/missions/${mission.id}/metrics`)).data,
    })),
  );
  const totals = metricRows.reduce(
    (sum, row) => ({
      opportunities: sum.opportunities + (row.metrics?.opportunities ?? 0),
      contacts: sum.contacts + (row.metrics?.verifiedContacts ?? 0),
      actions: sum.actions + (row.metrics?.actionCards ?? 0),
      routes: sum.routes + (row.metrics?.approvedRoutes ?? 0),
    }),
    { opportunities: 0, contacts: 0, actions: 0, routes: 0 },
  );
  const pendingDecisions = missionRows
    .map((mission) => ({ mission, decision: decisionByStage[mission.currentStage] }))
    .filter((row): row is { mission: Mission; decision: NonNullable<typeof row.decision> } => Boolean(row.decision));

  return (
    <AppShell currentPage="仪表盘">
      <PageHeader
        title="市场任务仪表盘"
        description="查看任务进度、已验证触达路径、待审批行动与本周需要推进的机会。"
        actions={<Link className="button button-primary" href="/missions/new"><Plus />新建市场任务</Link>}
      />
      {result.error && <ErrorState message={result.error.message} />}
      <MetricStrip metrics={[
        { label: '运行中的市场任务', value: missionRows.filter((mission) => mission.status === 'running').length, detail: `全部任务 ${missionRows.length}` },
        { label: '市场进入机会', value: totals.opportunities, detail: '当前工作区' },
        { label: '已验证触达路径', value: totals.contacts, detail: 'Source Confirmed 以上' },
        { label: '行动卡', value: totals.actions, detail: '包含全部版本' },
        { label: '已批准路线', value: totals.routes, detail: '可进入生态研究' },
        { label: '待处理决策', value: pendingDecisions.length, detail: '能力、路线、目标与行动' },
      ]} />
      <div className="split-layout">
        <Panel title="市场任务" description="最近更新的任务与当前流程工位" noPadding>
          <DataTable
            rows={missionRows}
            getRowKey={(mission) => mission.id}
            columns={[
              { key: 'name', label: '任务', render: (mission) => <div><Link className="cell-link" href={`/missions/${mission.id}`}>{mission.name}</Link><div className="cell-secondary">{mission.companyName}</div></div> },
              { key: 'countries', label: '目标国家', render: (mission) => mission.targetCountries.join(', ') },
              { key: 'stage', label: '当前阶段', render: (mission) => <StatusBadge value={mission.currentStage} /> },
              { key: 'status', label: '运行状态', render: (mission) => <StatusBadge value={mission.status} /> },
              { key: 'updated', label: '最近更新', render: (mission) => formatDate(mission.updatedAt) },
              { key: 'action', label: '', align: 'right', render: (mission) => <Link className="button button-ghost icon-button" href={`/missions/${mission.id}`} aria-label={`打开 ${mission.name}`}><ArrowRight /></Link> },
            ]}
            empty={<EmptyState title="还没有市场任务" description="创建一个任务，系统会从企业资料与目标市场开始建立证据和进入路线。" actionLabel="创建第一个任务" actionHref="/missions/new" />}
          />
        </Panel>
        <div className="stack">
          <Panel title="等待你处理" description="流程在关键业务判断完成后继续">
            {pendingDecisions.length === 0 ? (
              <EmptyState title="当前没有待决策项" description="能力、路线、目标和行动卡的决策会出现在这里。" />
            ) : (
              <div className="stack">
                {pendingDecisions.map(({ mission, decision }) => (
                  <div key={mission.id}>
                    <div className="cell-primary">{mission.name}</div>
                    <div className="cell-secondary">{decision.description}</div>
                    <Link className="button button-secondary" style={{ marginTop: 10 }} href={`/missions/${mission.id}/${decision.path}`}>{decision.label}</Link>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="工作台原则">
            <div className="stack">
              <div><strong>判断透明</strong><div className="cell-secondary">事实、推断、未知项和矛盾分别显示。</div></div>
              <div><strong>公开触达</strong><div className="cell-secondary">联系方式保留来源、公开属性与验证时间。</div></div>
              <div><strong>人工执行</strong><div className="cell-secondary">V1 由用户完成真实外联并记录结果。</div></div>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
