import {
  condition, continueAsNew, defineQuery, defineSignal, getExternalWorkflowHandle,
  ParentClosePolicy, proxyActivities, setHandler, startChild, workflowInfo,
} from '@temporalio/workflow';
import type {
  BudgetUpdatedSignal, CapabilityResearchRequestedSignal, CapabilityReviewSubmittedSignal, ManualRefreshRequestedSignal,
  MissionCompletionRequestedSignal, MissionPauseRequestedSignal, MissionResumeRequestedSignal,
  MissionWorkflowState, OpportunityMilestoneReportedSignal, RouteReviewSubmittedSignal,
  TargetReviewSubmittedSignal,
} from '@imea/contracts';
import { activityScope } from './activity-scope.js';
import type { MarketEntryActivities, MissionWorkflowInput } from './types.js';
import { opportunityWorkflow } from './opportunity-workflow.js';
import { refreshWorkflow } from './refresh-workflow.js';

function isBudgetFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (typeof current !== 'object') return typeof current === 'string' && current.includes('MISSION_BUDGET_EXHAUSTED');
    const record = current as { type?: unknown; message?: unknown; cause?: unknown };
    if (record.type === 'MISSION_BUDGET_EXHAUSTED' || (typeof record.message === 'string' && record.message.includes('MISSION_BUDGET_EXHAUSTED'))) return true;
    current = record.cause;
  }
  return false;
}

const activities = proxyActivities<MarketEntryActivities>({ startToCloseTimeout: '5 minutes', heartbeatTimeout: '15 seconds', retry: { maximumAttempts: 1 } });

export const routeReviewSubmitted = defineSignal<[RouteReviewSubmittedSignal]>('routeReviewSubmitted');
export const capabilityReviewSubmitted = defineSignal<[CapabilityReviewSubmittedSignal]>('capabilityReviewSubmitted');
export const targetReviewSubmitted = defineSignal<[TargetReviewSubmittedSignal]>('targetReviewSubmitted');
export const missionPauseRequested = defineSignal<[MissionPauseRequestedSignal]>('missionPauseRequested');
export const missionResumeRequested = defineSignal<[MissionResumeRequestedSignal]>('missionResumeRequested');
export const manualRefreshRequested = defineSignal<[ManualRefreshRequestedSignal]>('manualRefreshRequested');
export const capabilityResearchRequested = defineSignal<[CapabilityResearchRequestedSignal]>('capabilityResearchRequested');
export const budgetUpdated = defineSignal<[BudgetUpdatedSignal]>('budgetUpdated');
export const missionCompletionRequested = defineSignal<[MissionCompletionRequestedSignal]>('missionCompletionRequested');
export const opportunityMilestoneReported = defineSignal<[OpportunityMilestoneReportedSignal]>('opportunityMilestoneReported');
export const getMissionProgress = defineQuery<MissionWorkflowState>('getMissionProgress');
export const getBudgetUsage = defineQuery<Record<string, number>>('getBudgetUsage');
export const getPendingApprovals = defineQuery<string[]>('getPendingApprovals');
export const getChildOpportunityStatuses = defineQuery<MissionWorkflowState['childOpportunities']>('getChildOpportunityStatuses');

export async function missionWorkflow(input: MissionWorkflowInput): Promise<void> {
  const state: MissionWorkflowState = input.restoredState ?? {
    stage: 'compiling', completedSteps: [], pendingApprovals: [], childOpportunities: {}, paused: false,
    budgetReviewRequired: false, pendingRefreshRequestIds: [], pendingCapabilityResearchRequestIds: [], lastProcessedSignalSequence: 0,
  };
  let routeReview: RouteReviewSubmittedSignal | undefined;
  let capabilityReview: CapabilityReviewSubmittedSignal | undefined;
  let targetReview: TargetReviewSubmittedSignal | undefined;
  let completeRequested = false;
  let pauseReason: string | undefined;
  let pendingBudget: BudgetUpdatedSignal | undefined;
  const manualRefreshSignals: ManualRefreshRequestedSignal[] = state.pendingRefreshRequestIds.map((requestId) => ({ requestId, requestedByUserId: input.missionId }));
  const capabilitySignals: CapabilityResearchRequestedSignal[] = state.pendingCapabilityResearchRequestIds.map((requestId) => ({ requestId, requestedByUserId: input.missionId }));
  let budgetUsage: Record<string, number> = {};

  const signalReceived = (): void => { state.lastProcessedSignalSequence += 1; };
  setHandler(getMissionProgress, () => state);
  setHandler(getBudgetUsage, () => budgetUsage);
  setHandler(getPendingApprovals, () => state.pendingApprovals);
  setHandler(getChildOpportunityStatuses, () => state.childOpportunities);
  setHandler(routeReviewSubmitted, (signal) => { routeReview = signal; state.pendingApprovals = state.pendingApprovals.filter((item) => item !== 'market_route'); signalReceived(); });
  setHandler(capabilityReviewSubmitted, (signal) => { capabilityReview = signal; state.pendingApprovals = state.pendingApprovals.filter((item) => item !== 'capability_review'); signalReceived(); });
  setHandler(targetReviewSubmitted, (signal) => { targetReview = signal; state.pendingApprovals = state.pendingApprovals.filter((item) => item !== 'target_review'); signalReceived(); });
  setHandler(missionPauseRequested, (signal) => { state.paused = true; pauseReason = signal.reason; signalReceived(); });
  setHandler(missionResumeRequested, () => { state.paused = false; signalReceived(); });
  setHandler(manualRefreshRequested, (signal) => { if (!manualRefreshSignals.some((item) => item.requestId === signal.requestId)) manualRefreshSignals.push(signal); state.pendingRefreshRequestIds = manualRefreshSignals.map((item) => item.requestId); signalReceived(); });
  setHandler(capabilityResearchRequested, (signal) => { if (!capabilitySignals.some((item) => item.requestId === signal.requestId)) capabilitySignals.push(signal); state.pendingCapabilityResearchRequestIds = capabilitySignals.map((item) => item.requestId); signalReceived(); });
  setHandler(budgetUpdated, (signal) => { pendingBudget = signal; state.budgetReviewRequired = false; signalReceived(); });
  setHandler(missionCompletionRequested, () => { completeRequested = true; signalReceived(); });
  setHandler(opportunityMilestoneReported, (signal) => {
    state.childOpportunities[signal.opportunityId] = { workflowId: signal.workflowId, status: signal.opportunityStatus, milestone: signal.milestone, ...(signal.actionCardId ? { actionCardId: signal.actionCardId } : {}) };
    signalReceived();
  });

  const scoped = (activityType: string, businessId = input.missionId) => activityScope(input, activityType, businessId);
  const awaitResume = async (): Promise<void> => { if (state.paused) await condition(() => !state.paused || completeRequested); };
  const applyBudget = async (): Promise<void> => {
    if (!pendingBudget) return;
    const update = pendingBudget;
    pendingBudget = undefined;
    budgetUsage = update.budget;
    await activities.updateMissionBudget({ ...scoped('updateMissionBudget'), budget: update.budget });
    await Promise.all(Object.values(state.childOpportunities).map((child) => getExternalWorkflowHandle(child.workflowId).signal('opportunityBudgetUpdated', { budget: update.budget })));
  };
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    while (true) {
      await awaitResume();
      try {
        const result = await run();
        if (!state.completedSteps.includes(name)) state.completedSteps.push(name);
        return result;
      } catch (error) {
        if (!isBudgetFailure(error)) throw error;
        const previousStage = state.stage;
        state.stage = 'awaiting_budget_review';
        state.budgetReviewRequired = true;
        if (!state.pendingApprovals.includes('budget_review')) state.pendingApprovals.push('budget_review');
        await condition(() => pendingBudget !== undefined || completeRequested);
        if (completeRequested) throw error;
        await applyBudget();
        state.pendingApprovals = state.pendingApprovals.filter((item) => item !== 'budget_review');
        state.stage = previousStage;
      }
    }
  };

  if (state.stage !== 'active') {
    const mission = await step('loadMission', () => activities.loadMission(scoped('loadMission')));
    await step('compileMission', () => activities.compileMission(scoped('compileMission')));
    if (mission.supplierKnown !== false) {
    state.stage = 'ingesting_company_data';
    await step('ingestCompanySources', () => activities.ingestCompanySources(scoped('ingestCompanySources')));
    state.stage = 'researching_capabilities';
    await step('extractCapabilityClaims', () => activities.extractCapabilityClaims(scoped('extractCapabilityClaims')));
    await activities.markMissionAwaitingCapabilityReview(scoped('markMissionAwaitingCapabilityReview'));
    state.stage = 'awaiting_capability_review';
    if (!state.pendingApprovals.includes('capability_review')) state.pendingApprovals.push('capability_review');
    while (!capabilityReview && !completeRequested) {
      await condition(() => capabilityReview !== undefined || completeRequested || capabilitySignals.length > 0);
      while (capabilitySignals.length > 0) {
        const request = capabilitySignals.shift()!;
        state.pendingCapabilityResearchRequestIds = capabilitySignals.map((item) => item.requestId);
        await step(`extractCapabilityClaims:${request.requestId}`, () => activities.extractCapabilityClaims(scoped('extractCapabilityClaims', request.requestId)));
      }
    }
    if (completeRequested) { await activities.markMissionCompleted(scoped('markMissionCompleted')); return; }
    await activities.recordCapabilityReview({ ...scoped('recordCapabilityReview', capabilityReview!.commandId), ...capabilityReview! });
    }
    state.stage = 'researching_routes';
    await Promise.all([
      step('researchMarketRoutes', () => activities.researchMarketRoutes(scoped('researchMarketRoutes'))),
      step('researchCompetitors', () => activities.researchCompetitors(scoped('researchCompetitors'))),
      step('researchExpertSignals', () => activities.researchExpertSignals(scoped('researchExpertSignals'))),
    ]);
    await activities.markMissionAwaitingRouteReview(scoped('markMissionAwaitingRouteReview'));
    state.stage = 'awaiting_route_review';
    if (!state.pendingApprovals.includes('market_route')) state.pendingApprovals.push('market_route');
    while (!routeReview && !completeRequested) {
      await condition(() => routeReview !== undefined || completeRequested || capabilitySignals.length > 0);
      while (capabilitySignals.length > 0) {
        const request = capabilitySignals.shift()!;
        state.pendingCapabilityResearchRequestIds = capabilitySignals.map((item) => item.requestId);
        await step(`extractCapabilityClaims:${request.requestId}`, () => activities.extractCapabilityClaims(scoped('extractCapabilityClaims', request.requestId)));
      }
    }
    if (completeRequested) { await activities.markMissionCompleted(scoped('markMissionCompleted')); return; }
    const approvedRoutes = await activities.recordRouteReview({ ...scoped('recordRouteReview', routeReview?.commandId ?? input.missionId), ...routeReview! });
    state.stage = 'researching_ecosystem';
    await Promise.all(approvedRoutes.map((routeId) => step(`discoverEcosystem:${routeId}`, () => activities.discoverEcosystem({ ...scoped('discoverEcosystem', routeId), routeId }))));
    await step('resolveEntities', () => activities.resolveEntities(scoped('resolveEntities')));
    state.stage = 'researching_targets';
    const targets = (await step('rankTargets', () => activities.rankTargets(scoped('rankTargets')))).slice(0, mission.topTargetLimit);
    state.candidateTargetIds = targets;
    await activities.markMissionAwaitingTargetReview({ ...scoped('markMissionAwaitingTargetReview'), candidateTargetIds: targets });
    state.stage = 'awaiting_target_review';
    if (!state.pendingApprovals.includes('target_review')) state.pendingApprovals.push('target_review');
    await condition(() => targetReview !== undefined || completeRequested);
    if (completeRequested) { await activities.markMissionCompleted(scoped('markMissionCompleted')); return; }
    const selectedTargets = await activities.recordTargetReview({ ...scoped('recordTargetReview', targetReview!.commandId), ...targetReview! });
    state.selectedTargetIds = selectedTargets.map((target) => target.organizationId);
    state.stage = 'researching_contacts';
    for (const target of selectedTargets) {
      const opportunityId = await activities.createOpportunity({ ...scoped('createOpportunity', target.organizationId), organizationId: target.organizationId, routeId: target.routeId });
      const workflowId = `opportunity:${input.tenantId}:${opportunityId}`;
      await startChild(opportunityWorkflow, { args: [{ tenantId: input.tenantId, missionId: input.missionId, opportunityId, ownershipRunId: workflowInfo().firstExecutionRunId }], workflowId, parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON });
      state.childOpportunities[opportunityId] = { workflowId, status: 'target_identified', milestone: 'started' };
      await activities.recordChildWorkflow({ ...scoped('recordChildWorkflow', opportunityId), opportunityId, workflowId });
    }
    state.stage = 'generating_actions';
    await condition(() => Object.values(state.childOpportunities).every((child) => ['action_ready', 'approved', 'paused', 'lost', 'archived', 'won'].includes(child.status)) || completeRequested);
    if (completeRequested) { await activities.markMissionCompleted(scoped('markMissionCompleted')); return; }
    state.stage = 'awaiting_action_review';
    if (!state.pendingApprovals.includes('action_card')) state.pendingApprovals.push('action_card');
    await activities.markMissionAwaitingActionReview(scoped('markMissionAwaitingActionReview'));
    await condition(() => Object.values(state.childOpportunities).some((child) => child.status === 'approved') || completeRequested);
    if (completeRequested) { await activities.markMissionCompleted(scoped('markMissionCompleted')); return; }
    state.pendingApprovals = state.pendingApprovals.filter((item) => item !== 'action_card');
    state.stage = 'active';
    await activities.markMissionActive(scoped('markMissionActive'));
    await activities.createRefreshSchedule(scoped('createRefreshSchedule'));
  }

  while (!completeRequested) {
    await condition(() => completeRequested || manualRefreshSignals.length > 0 || capabilitySignals.length > 0 || state.paused || pendingBudget !== undefined || workflowInfo().continueAsNewSuggested);
    if (state.paused) {
      await activities.setMissionPaused({ ...scoped('setMissionPaused', `pause:${state.lastProcessedSignalSequence}`), paused: true, ...(pauseReason ? { reason: pauseReason } : {}) });
      await condition(() => !state.paused || completeRequested);
      if (!completeRequested) await activities.setMissionPaused({ ...scoped('setMissionPaused', `resume:${state.lastProcessedSignalSequence}`), paused: false });
    }
    await applyBudget();
    while (manualRefreshSignals.length > 0) {
      const request = manualRefreshSignals.shift()!;
      state.pendingRefreshRequestIds = manualRefreshSignals.map((item) => item.requestId);
      const scheduledAt = new Date().toISOString();
      const handle = await startChild(refreshWorkflow, { args: [{ tenantId: input.tenantId, missionId: input.missionId, scheduledAt, requestId: request.requestId, triggerType: 'manual' }], workflowId: `refresh:${input.tenantId}:${input.missionId}:manual:${request.requestId}` });
      await handle.result();
    }
    while (capabilitySignals.length > 0) {
      const request = capabilitySignals.shift()!;
      state.pendingCapabilityResearchRequestIds = capabilitySignals.map((item) => item.requestId);
      await step(`extractCapabilityClaims:${request.requestId}`, () => activities.extractCapabilityClaims(scoped('extractCapabilityClaims', request.requestId)));
    }
    if (workflowInfo().historyLength > 10_000 || workflowInfo().continueAsNewSuggested) await continueAsNew<typeof missionWorkflow>({ ...input, restoredState: state });
  }
  await activities.markMissionCompleted(scoped('markMissionCompleted'));
}
