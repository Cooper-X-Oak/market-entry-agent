import { workflowInfo } from '@temporalio/workflow';
import type { ActivityCommandScope } from '@imea/contracts';

export function activityScope(
  input: { tenantId: string; missionId: string; ownershipRunId?: string; missionExecutionId?: string; scopeVersion?: 2 },
  activityType: string,
  businessId: string,
  extra: Partial<Pick<ActivityCommandScope, 'opportunityId' | 'organizationId' | 'routeId' | 'interactionId' | 'actionCardId'>> = {},
): ActivityCommandScope {
  const info = workflowInfo();
  if (input.scopeVersion === 2 && input.missionExecutionId) {
    return {
      tenantId: input.tenantId, missionId: input.missionId,
      scopeVersion: 2, missionExecutionId: input.missionExecutionId, businessId,
      ownershipRunId: input.ownershipRunId ?? info.runId,
      ...extra,
      idempotencyKey: `v2:${input.missionExecutionId}:${businessId}`,
      correlationId: info.runId, requestedBy: { type: 'system', id: info.workflowId },
    };
  }
  // Keep the exact historical argument shape for histories without execution identity.
  return {
    tenantId: input.tenantId,
    missionId: input.missionId,
    ...(input.ownershipRunId ? { ownershipRunId: input.ownershipRunId } : info.workflowId.startsWith('mission:') ? { ownershipRunId: info.firstExecutionRunId } : {}),
    ...extra,
    idempotencyKey: `${info.workflowId}:${activityType}:${businessId}`,
    correlationId: info.runId,
    requestedBy: { type: 'system', id: info.workflowId },
  };
}
