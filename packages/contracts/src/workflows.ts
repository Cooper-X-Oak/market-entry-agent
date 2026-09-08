import { z } from 'zod';
import { actorRefSchema, timestampSchema, uuidSchema } from './common.js';
import { missionStageSchema, opportunityStatusSchema, prioritySchema } from './enums.js';
import { budgetConfigSchema } from './mission.js';

export const activityCommandScopeSchema = z.object({
  tenantId: uuidSchema,
  missionId: uuidSchema,
  missionExecutionId: uuidSchema.optional(),
  scopeVersion: z.literal(2).optional(),
  businessId: z.string().min(1).optional(),
  ownershipRunId: z.string().min(1).optional(),
  opportunityId: uuidSchema.optional(),
  organizationId: uuidSchema.optional(),
  routeId: uuidSchema.optional(),
  interactionId: uuidSchema.optional(),
  actionCardId: uuidSchema.optional(),
  idempotencyKey: z.string().min(1),
  correlationId: uuidSchema,
  causationId: uuidSchema.optional(),
  requestedBy: actorRefSchema.optional(),
});

export const routeReviewSubmittedSignalSchema = z.object({
  approvedRouteIds: z.array(uuidSchema).min(1).max(3),
  acceptedArtifactVersionIds: z.array(uuidSchema).min(1),
  decidedByUserId: uuidSchema,
  comment: z.string().optional(),
  commandId: uuidSchema.optional(),
});
export const capabilityReviewSubmittedSignalSchema = z.object({
  resolvedClaimIds: z.array(uuidSchema).min(1),
  decidedByUserId: uuidSchema,
  comment: z.string().optional(),
  commandId: uuidSchema,
});
export const targetReviewSubmittedSignalSchema = z.object({
  selectedTargetIds: z.array(uuidSchema).min(1).max(3),
  decidedByUserId: uuidSchema,
  comment: z.string().optional(),
  commandId: uuidSchema,
});
export const missionPauseRequestedSignalSchema = z.object({ requestedByUserId: uuidSchema, reason: z.string().optional() });
export const missionResumeRequestedSignalSchema = z.object({ requestedByUserId: uuidSchema });
export const manualRefreshRequestedSignalSchema = z.object({ requestId: uuidSchema, requestedByUserId: uuidSchema });
export const capabilityResearchRequestedSignalSchema = z.object({ requestId: uuidSchema, question: z.string().optional(), requestedByUserId: uuidSchema });
export const budgetUpdatedSignalSchema = z.object({ budget: budgetConfigSchema, updatedByUserId: uuidSchema });
export const missionCompletionRequestedSignalSchema = z.object({ requestedByUserId: uuidSchema });
export const opportunityMilestoneReportedSignalSchema = z.object({
  opportunityId: uuidSchema,
  workflowId: z.string().min(1),
  milestone: z.string().min(1),
  opportunityStatus: opportunityStatusSchema,
  actionCardId: uuidSchema.optional(),
  occurredAt: timestampSchema,
});
export const actionCardDecisionSignalSchema = z.object({
  actionCardId: uuidSchema,
  decision: z.enum(['approve', 'request_changes']),
  comment: z.string().optional(),
  decidedByUserId: uuidSchema,
  expectedVersionNo: z.number().int().positive(),
});
export const actionCardVersionCreatedSignalSchema = z.object({
  actionCardId: uuidSchema,
  versionNo: z.number().int().positive(),
  createdByUserId: uuidSchema,
});
export const interactionRecordedSignalSchema = z.object({ interactionId: uuidSchema, recordedByUserId: uuidSchema });
export const manualResearchRequestedSignalSchema = z.object({ requestId: uuidSchema, requestedByUserId: uuidSchema, focus: z.string().optional() });
export const opportunityPauseRequestedSignalSchema = z.object({ requestedByUserId: uuidSchema, reason: z.string().optional() });
export const opportunityResumeRequestedSignalSchema = z.object({ requestedByUserId: uuidSchema });
export const priorityChangedSignalSchema = z.object({ priority: prioritySchema, changedByUserId: uuidSchema });
export const opportunityBudgetUpdatedSignalSchema = z.object({ budget: budgetConfigSchema });

export const missionWorkflowStateSchema = z.object({
  stage: missionStageSchema,
  completedSteps: z.array(z.string()),
  pendingApprovals: z.array(z.string()),
  childOpportunities: z.record(uuidSchema, z.object({
    workflowId: z.string(),
    status: z.string(),
    milestone: z.string(),
    actionCardId: uuidSchema.optional(),
  })),
  paused: z.boolean(),
  budgetReviewRequired: z.boolean(),
  pendingRefreshRequestIds: z.array(uuidSchema),
  pendingCapabilityResearchRequestIds: z.array(uuidSchema),
  candidateTargetIds: z.array(uuidSchema).optional(),
  selectedTargetIds: z.array(uuidSchema).optional(),
  lastProcessedSignalSequence: z.number().int().nonnegative(),
});

export const opportunityWorkflowStateSchema = z.object({
  status: opportunityStatusSchema,
  currentStep: z.string().optional(),
  pendingUnknowns: z.array(z.string()),
  currentActionCardId: uuidSchema.optional(),
  currentActionCardVersionNo: z.number().int().positive().optional(),
  currentScore: z.number().optional(),
  pendingInteractionIds: z.array(uuidSchema),
  processedInteractionIds: z.array(uuidSchema),
  pendingResearchRequests: z.array(z.object({ requestId: uuidSchema, focus: z.string().optional() })),
  paused: z.boolean(),
  budgetReviewRequired: z.boolean(),
  revisionCount: z.number().int().nonnegative(),
  lastProcessedSignalSequence: z.number().int().nonnegative(),
});

export const refreshWorkflowResultSchema = z.object({
  proposalId: uuidSchema,
  changedSourceCount: z.number().int().nonnegative(),
  reverifiedContactCount: z.number().int().nonnegative(),
  changedCompetitorCount: z.number().int().nonnegative(),
  affectedOpportunityIds: z.array(uuidSchema),
});

export type ActivityCommandScope = z.infer<typeof activityCommandScopeSchema>;
export type RouteReviewSubmittedSignal = z.infer<typeof routeReviewSubmittedSignalSchema>;
export type CapabilityReviewSubmittedSignal = z.infer<typeof capabilityReviewSubmittedSignalSchema>;
export type TargetReviewSubmittedSignal = z.infer<typeof targetReviewSubmittedSignalSchema>;
export type MissionPauseRequestedSignal = z.infer<typeof missionPauseRequestedSignalSchema>;
export type MissionResumeRequestedSignal = z.infer<typeof missionResumeRequestedSignalSchema>;
export type ManualRefreshRequestedSignal = z.infer<typeof manualRefreshRequestedSignalSchema>;
export type CapabilityResearchRequestedSignal = z.infer<typeof capabilityResearchRequestedSignalSchema>;
export type BudgetUpdatedSignal = z.infer<typeof budgetUpdatedSignalSchema>;
export type MissionCompletionRequestedSignal = z.infer<typeof missionCompletionRequestedSignalSchema>;
export type OpportunityMilestoneReportedSignal = z.infer<typeof opportunityMilestoneReportedSignalSchema>;
export type ActionCardDecisionSignal = z.infer<typeof actionCardDecisionSignalSchema>;
export type ActionCardVersionCreatedSignal = z.infer<typeof actionCardVersionCreatedSignalSchema>;
export type InteractionRecordedSignal = z.infer<typeof interactionRecordedSignalSchema>;
export type ManualResearchRequestedSignal = z.infer<typeof manualResearchRequestedSignalSchema>;
export type OpportunityPauseRequestedSignal = z.infer<typeof opportunityPauseRequestedSignalSchema>;
export type OpportunityResumeRequestedSignal = z.infer<typeof opportunityResumeRequestedSignalSchema>;
export type PriorityChangedSignal = z.infer<typeof priorityChangedSignalSchema>;
export type OpportunityBudgetUpdatedSignal = z.infer<typeof opportunityBudgetUpdatedSignalSchema>;
export type MissionWorkflowState = z.infer<typeof missionWorkflowStateSchema>;
export type OpportunityWorkflowState = z.infer<typeof opportunityWorkflowStateSchema>;
export type RefreshWorkflowResult = z.infer<typeof refreshWorkflowResultSchema>;
