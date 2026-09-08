import { ArrowRight, Check, Download, Radio, Search } from 'lucide-react';
import Link from 'next/link';
import { CommandButton } from '@/components/command-button';
import { ErrorState } from '@/components/states';
import { MetricStrip, Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StageProgress } from '@/components/stage-progress';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { MissionCockpit, Opportunity, TimelineItem } from '@/lib/types';

export default async function MissionOverviewPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const [cockpitResult, opportunityResult, timelineResult] = await Promise.all([safeApi<MissionCockpit>(`/api/v1/missions/${missionId}/cockpit`), safeApi<Opportunity[]>(`/api/v1/missions/${missionId}/opportunities`), safeApi<TimelineItem[]>(`/api/v1/missions/${missionId}/timeline`)]);
  if (!cockpitResult.data) return <ErrorState message={cockpitResult.error?.message ?? '任务不存在'} />;
  const cockpit = cockpitResult.data;
  const { mission, counts, progress } = cockpit;
  const opportunities = opportunityResult.data ?? [];
  const budgetValues = Object.values(progress?.budgetUsage ?? {});
  const budgetUsage = budgetValues.length ? Math.round(Math.max(...budgetValues) * 100) : 0;
  return <><PageHeader title={mission.name} description={`${mission.companyName} · ${mission.targetCountries.join(', ')} · ${mission.targetIndustries.join(', ')}`} actions={<><span className={`mode-indicator mode-${cockpit.executionMode}`}><Radio />{cockpit.executionMode === 'live' ? '真实研究' : '样例数据'}</span>{mission.status === 'paused' ? <CommandButton path={`/api/v1/missions/${missionId}/resume`} label="继续" className="button button-primary" /> : mission.status === 'running' ? <CommandButton path={`/api/v1/missions/${missionId}/pause`} label="暂停" className="button button-secondary" /> : null}{['running', 'paused'].includes(mission.status) && counts.approvedActionCards > 0 && <CommandButton path={`/api/v1/missions/${missionId}/complete`} label="完成任务" className="button button-secondary" />}<a className="button button-secondary" href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1/missions/${missionId}/export`}><Download />导出</a></>} />
    <section className="cockpit-band" aria-label="业务闭环进度"><div className="business-chain">{cockpit.businessChain.map((step, index) => <div className="business-step" data-ready={step.ready} key={step.key}><span>{step.ready ? <Check /> : <Search />}</span><strong>{step.label}</strong>{step.optional && <small>可选路径</small>}{index < cockpit.businessChain.length - 1 && <ArrowRight className="business-arrow" />}</div>)}</div><StageProgress stage={mission.currentStage} budgetUsage={budgetUsage} childTotal={progress?.childOpportunityTotal} childActionReady={progress?.childOpportunityActionReady} pendingUserActions={progress?.pendingUserActions} /></section>
    <div style={{ height: 18 }} />
    <MetricStrip metrics={[{ label: '公开来源', value: counts.sources, detail: 'Source Snapshot' }, { label: '已批准路线', value: counts.approvedRoutes, detail: 'Route' }, { label: 'Top 10 候选', value: counts.candidateTargets, detail: 'Target Gate' }, { label: '已选目标', value: counts.selectedTargets, detail: '最多 3 个' }, { label: '市场机会', value: counts.opportunities, detail: 'Opportunity' }, { label: '已批准行动卡', value: counts.approvedActionCards, detail: 'BM1 交付' }]} />
    <div className="split-layout"><div className="stack"><Panel title="业务任务" description="这一条 Mission 要解决的业务问题"><div className="form-grid"><Summary label="企业官网" value={mission.companyWebsite} /><Summary label="产品范围" value={mission.productScope} /><Summary label="业务目标" value={mission.objective} /><Summary label="成功标准" value={mission.successDefinition} /></div></Panel><Panel title="正在形成的机会" description="仅显示你选中的目标所形成的机会">{opportunities.slice(0, 5).map((opportunity) => <div key={opportunity.id} className="cockpit-opportunity"><div><Link className="cell-link" href={`/missions/${missionId}/opportunities/${opportunity.id}`}>{opportunity.title}</Link><div className="cell-secondary">{opportunity.nextAction}</div></div><div><strong>{opportunity.score}</strong><StatusBadge value={opportunity.status} /></div></div>)}{opportunities.length === 0 && <div className="cell-secondary">选择优先目标后，系统会在这里形成 Opportunity。</div>}</Panel></div><div className="stack"><Panel title="现在需要你决定">{mission.currentStage === 'draft' ? <><p>任务卡已就绪。启动后将使用公开来源进行企业能力与市场研究。</p><CommandButton path={`/api/v1/missions/${missionId}/start`} label="启动真实研究" className="button button-primary" /></> : cockpit.currentDecision ? <div className="decision-callout"><StatusBadge value={cockpit.currentDecision.type} /><h2>{cockpit.currentDecision.title}</h2><p>{cockpit.currentDecision.instruction}</p><Link className="button button-primary" href={cockpit.currentDecision.path}>进入当前决策 <ArrowRight /></Link></div> : mission.currentStage === 'active' ? <div className="decision-callout"><StatusBadge value="approved" /><h2>BM1 业务闭环已成立</h2><p>至少一个目标已经形成经批准的 Action Card。你可以导出交付物，或完成本次 Mission。</p></div> : <div className="decision-callout"><StatusBadge value={mission.currentStage} /><h2>系统正在推进</h2><p>公开研究、证据固化和工作流编排正在当前工位运行；到达业务判断点后会在这里给出唯一下一步。</p></div>}</Panel><Panel title="最近业务变化">{(timelineResult.data ?? []).slice(0, 6).map((event) => <div key={event.eventId} className="cockpit-event"><div className="cell-primary">{event.title}</div><div className="cell-secondary">{formatDate(event.occurredAt)}</div></div>)}{(timelineResult.data ?? []).length === 0 && <div className="cell-secondary">暂无业务变化。</div>}</Panel></div></div>
  </>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div><div className="cell-secondary">{label}</div><div style={{ marginTop: 4, fontWeight: 600, whiteSpace: 'pre-wrap' }}>{value}</div></div>; }
