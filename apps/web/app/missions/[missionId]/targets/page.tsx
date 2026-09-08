import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { TargetReview } from '@/components/target-review';
import { safeApi } from '@/lib/api';
import type { Mission, TargetRow } from '@/lib/types';

export default async function TargetsPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const [targetResult, missionResult] = await Promise.all([safeApi<TargetRow[]>(`/api/v1/missions/${missionId}/targets`), safeApi<Mission>(`/api/v1/missions/${missionId}`)]);
  if (targetResult.error) return <ErrorState message={targetResult.error.message} />;
  const targets = targetResult.data ?? [];
  const enabled = missionResult.data?.currentStage === 'awaiting_target_review';
  return <><PageHeader title="选择优先目标" description="系统展示通过 Target Gate 的 Top 10 真实组织。请选择 1–3 个进入机会、利益角色、公开联系路径和行动卡研究。" />
    <Panel title="Top 10 目标" description="综合产品适配、路线适配、需求信号、可触达性与证据质量" noPadding>{targets.length === 0 ? <EmptyState title="目标排序尚未形成" description="路线批准后，系统会研究真实组织并只展示证据门槛达标的候选。" /> : <TargetReview missionId={missionId} targets={targets} enabled={enabled} />}</Panel>
  </>;
}
