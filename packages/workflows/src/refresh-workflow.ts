import { proxyActivities } from '@temporalio/workflow';
import type { RefreshWorkflowResult } from '@imea/contracts';
import { activityScope } from './activity-scope.js';
import type { MarketEntryActivities, RefreshWorkflowInput } from './types.js';

const activities = proxyActivities<MarketEntryActivities>({ startToCloseTimeout: '5 minutes', retry: { maximumAttempts: 5, initialInterval: '2 seconds', backoffCoefficient: 2, maximumInterval: '1 minute' } });

export async function refreshWorkflow(input: RefreshWorkflowInput): Promise<RefreshWorkflowResult> {
  const scheduledAt = input.triggerType === 'scheduled' ? new Date().toISOString() : input.scheduledAt;
  const requestId = input.triggerType === 'scheduled' ? scheduledAt : input.requestId;
  const scope = (activityType: string, businessId: string) => ({ ...activityScope(input, activityType, businessId), scheduledAt, requestId, triggerType: input.triggerType });
  const refreshScope = await activities.loadRefreshScope(scope('loadRefreshScope', input.requestId));
  const [sourceResults, contactResults, competitorResults] = await Promise.all([
    Promise.all(refreshScope.sourceIds.map((sourceId) => activities.refreshSource({ ...scope('refreshSource', sourceId), sourceId }))),
    Promise.all(refreshScope.contactPointIds.map((contactPointId) => activities.refreshContact({ ...scope('refreshContact', contactPointId), contactPointId }))),
    Promise.all(refreshScope.competitorIds.map((competitorId) => activities.refreshCompetitor({ ...scope('refreshCompetitor', competitorId), competitorId }))),
  ]);
  const changedSnapshotIds = sourceResults.filter((result) => result.changed && result.snapshotId).map((result) => result.snapshotId!);
  return activities.createRefreshProposal({
    ...scope('createRefreshProposal', input.requestId),
    changedSnapshotIds,
    reverifiedContactCount: contactResults.filter((result) => result.status === 'succeeded').length,
    changedCompetitorCount: competitorResults.filter((result) => result.status === 'succeeded' && result.metadata?.changed === true).length,
  });
}
