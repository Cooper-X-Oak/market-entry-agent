'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function SseBridge({ missionId }: { missionId: string }) {
  const client = useQueryClient();
  const router = useRouter();
  useEffect(() => { const source = new EventSource(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1/missions/${missionId}/stream`, { withCredentials: true }); const invalidate = () => { void client.invalidateQueries({ queryKey: ['mission', missionId] }); router.refresh(); }; ['mission.stage_changed.v1','mission.paused.v1','mission.resumed.v1','mission.completed.v1','mission.capability_review_completed.v1','mission.route_review_completed.v1','mission.target_review_completed.v1','mission.action_review_requested.v1','artifact.version_proposed.v1','artifact.version_accepted.v1','market_route.approved.v1','market_route.deprioritized.v1','target.assessed.v1','target.selected.v1','opportunity.created.v1','opportunity.scored.v1','opportunity.state_transitioned.v1','contact_path.research_required.v1','action_card.version_created.v1','action_card.changes_requested.v1','action_card.approved.v1','action_card.executed.v1','interaction.recorded.v1','interaction.interpreted.v1','refresh.proposal_created.v1','refresh.proposal_accepted.v1','stream.reset_required'].forEach((type) => source.addEventListener(type, invalidate)); return () => source.close(); }, [client, missionId, router]);
  return null;
}
