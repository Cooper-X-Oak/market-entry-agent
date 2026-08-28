import type {
  ActivityCommandScope,
  ActorRef,
  BudgetConfig,
  InteractionInterpretation,
  MissionWorkflowState,
  OpportunityStatus,
  OpportunityWorkflowState,
  RefreshWorkflowResult,
} from '@imea/contracts';

export interface MissionWorkflowInput { tenantId: string; missionId: string; restoredState?: MissionWorkflowState }
export interface OpportunityWorkflowInput { tenantId: string; missionId: string; opportunityId: string; restoredState?: OpportunityWorkflowState }
export interface RefreshWorkflowInput { tenantId: string; missionId: string; scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled' }

export type MissionProgress = MissionWorkflowState;
export type OpportunityProgress = OpportunityWorkflowState;
export interface ActivityResult<T = Record<string, unknown>> { id: string; status: 'succeeded' | 'failed'; metadata?: T }

export type Scoped<T extends object = object> = ActivityCommandScope & T;

export interface MarketEntryActivities {
  loadMission(input: Scoped): Promise<{ id: string; budget: BudgetConfig; topTargetLimit: number }>;
  compileMission(input: Scoped): Promise<ActivityResult>;
  ingestCompanySources(input: Scoped): Promise<ActivityResult>;
  extractCapabilityClaims(input: Scoped): Promise<ActivityResult>;
  researchMarketRoutes(input: Scoped): Promise<ActivityResult>;
  researchCompetitors(input: Scoped): Promise<ActivityResult>;
  researchExpertSignals(input: Scoped): Promise<ActivityResult>;
  markMissionAwaitingRouteReview(input: Scoped): Promise<void>;
  loadApprovedRoutes(input: Scoped): Promise<string[]>;
  discoverEcosystem(input: Scoped<{ routeId: string }>): Promise<ActivityResult>;
  resolveEntities(input: Scoped): Promise<ActivityResult>;
  rankTargets(input: Scoped): Promise<string[]>;
  createOpportunity(input: Scoped<{ organizationId: string }>): Promise<string>;
  recordChildWorkflow(input: Scoped<{ opportunityId: string; workflowId: string }>): Promise<void>;
  markMissionActive(input: Scoped): Promise<void>;
  markMissionCompleted(input: Scoped): Promise<void>;
  setMissionPaused(input: Scoped<{ paused: boolean; reason?: string }>): Promise<void>;
  updateMissionBudget(input: Scoped<{ budget: BudgetConfig }>): Promise<void>;
  createRefreshSchedule(input: Scoped): Promise<void>;

  loadOpportunity(input: Scoped<{ opportunityId: string }>): Promise<{ id: string; status: OpportunityStatus }>;
  resolveEntity(input: Scoped<{ opportunityId: string }>): Promise<ActivityResult>;
  mapStakeholders(input: Scoped<{ opportunityId: string }>): Promise<ActivityResult>;
  findContactPaths(input: Scoped<{ opportunityId: string }>): Promise<string[]>;
  verifyContactPoint(input: Scoped<{ opportunityId: string; contactPointId: string }>): Promise<ActivityResult>;
  qualifyOpportunity(input: Scoped<{ opportunityId: string }>): Promise<{ score: number; status: OpportunityStatus; unknowns: string[] }>;
  buildActionCard(input: Scoped<{ opportunityId: string; basedOnVersionNo?: number; feedbackRefs?: string[]; feedbackComment?: string }>): Promise<{ actionCardId: string; versionNo: number }>;
  recordActionCardDecision(input: Scoped<{ opportunityId: string; actionCardId: string; decision: 'approve' | 'request_changes'; comment?: string; decidedByUserId: string; expectedVersionNo: number }>): Promise<void>;
  interpretInteraction(input: Scoped<{ opportunityId: string; interactionId: string }>): Promise<InteractionInterpretation>;
  applyInteractionInterpretation(input: Scoped<{ opportunityId: string; interactionId: string; interpretation: InteractionInterpretation }>): Promise<{ status: OpportunityStatus; regenerateActionCard: boolean; feedbackRefs: string[] }>;
  runFocusedOpportunityResearch(input: Scoped<{ opportunityId: string; focus?: string }>): Promise<ActivityResult>;
  reportOpportunityMilestone(input: Scoped<{ opportunityId: string; workflowId: string; milestone: string; opportunityStatus: OpportunityStatus; actionCardId?: string; occurredAt: string }>): Promise<void>;
  closeOpportunity(input: Scoped<{ opportunityId: string }>): Promise<void>;

  loadRefreshScope(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled' }>): Promise<{ sourceIds: string[]; contactPointIds: string[]; competitorIds: string[] }>;
  refreshSource(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; sourceId: string }>): Promise<{ changed: boolean; snapshotId?: string }>;
  refreshContact(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; contactPointId: string }>): Promise<ActivityResult>;
  refreshCompetitor(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; competitorId: string }>): Promise<ActivityResult>;
  createRefreshProposal(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; changedSnapshotIds: string[]; reverifiedContactCount: number; changedCompetitorCount: number }>): Promise<RefreshWorkflowResult>;
  applyRefreshProposal(input: Scoped<{ proposalId: string; actor: ActorRef }>): Promise<ActivityResult>;
}
