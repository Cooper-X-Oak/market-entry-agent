import { workflowInfo } from '@temporalio/workflow';
import type { ActivityCommandScope } from '@imea/contracts';

export function activityScope(
  input: { tenantId: string; missionId: string },
  activityType: string,
  businessId: string,
  extra: Partial<Pick<ActivityCommandScope, 'opportunityId' | 'organizationId' | 'routeId' | 'interactionId' | 'actionCardId'>> = {},
): ActivityCommandScope {
  const info = workflowInfo();
  return {
    tenantId: input.tenantId,
    missionId: input.missionId,
    ...extra,
    idempotencyKey: `${info.workflowId}:${info.runId}:${activityType}:${businessId}`,
    correlationId: info.runId,
    requestedBy: { type: 'system', id: info.workflowId },
  };
}
