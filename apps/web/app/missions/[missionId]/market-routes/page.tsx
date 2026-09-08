import { EmptyState, ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { RouteReview } from '@/components/route-review';
import { safeApi } from '@/lib/api';
import type { MarketRoute, Mission } from '@/lib/types';

export default async function MarketRoutesPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const [routeResult, missionResult] = await Promise.all([safeApi<MarketRoute[]>(`/api/v1/missions/${missionId}/routes`), safeApi<Mission>(`/api/v1/missions/${missionId}`)]);
  if (routeResult.error) return <ErrorState message={routeResult.error.message} />;
  const routes = routeResult.data ?? [];
  const enabled = missionResult.data?.currentStage === 'awaiting_route_review';
  return <><PageHeader title="批准市场进入路线" description="比较每条路线的公开证据、反向证据、进入难度和资源投入。你批准的路线会成为后续目标研究边界。" />
    <Panel title="路线候选" description={`${routes.length} 条候选 · 选择一条或多条`} noPadding>{routes.length === 0 ? <EmptyState title="路线研究尚未完成" description="能力边界确认后，系统会结合目标市场公开信息生成路线候选。" /> : <RouteReview missionId={missionId} routes={routes} enabled={enabled} />}</Panel>
  </>;
}
