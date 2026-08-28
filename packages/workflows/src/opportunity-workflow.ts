import { condition, continueAsNew, defineQuery, defineSignal, proxyActivities, setHandler, workflowInfo } from '@temporalio/workflow';
import type {
  ActionCardDecisionSignal, InteractionRecordedSignal, ManualResearchRequestedSignal,
  OpportunityBudgetUpdatedSignal, OpportunityPauseRequestedSignal, OpportunityResumeRequestedSignal,
  OpportunityWorkflowState, PriorityChangedSignal,
} from '@imea/contracts';
import { activityScope } from './activity-scope.js';
import type { MarketEntryActivities, OpportunityWorkflowInput } from './types.js';

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

const activities = proxyActivities<MarketEntryActivities>({ startToCloseTimeout: '5 minutes', retry: { maximumAttempts: 5, initialInterval: '2 seconds', backoffCoefficient: 2, maximumInterval: '1 minute' } });

export const actionCardDecision = defineSignal<[ActionCardDecisionSignal]>('actionCardDecision');
export const interactionRecorded = defineSignal<[InteractionRecordedSignal]>('interactionRecorded');
export const manualResearchRequested = defineSignal<[ManualResearchRequestedSignal]>('manualResearchRequested');
export const opportunityPauseRequested = defineSignal<[OpportunityPauseRequestedSignal]>('opportunityPauseRequested');
export const opportunityResumeRequested = defineSignal<[OpportunityResumeRequestedSignal]>('opportunityResumeRequested');
export const priorityChanged = defineSignal<[PriorityChangedSignal]>('priorityChanged');
export const opportunityBudgetUpdated = defineSignal<[OpportunityBudgetUpdatedSignal]>('opportunityBudgetUpdated');
export const getOpportunityProgress = defineQuery<OpportunityWorkflowState>('getOpportunityProgress');
export const getCurrentActionCard = defineQuery<{ actionCardId?: string; versionNo?: number }>('getCurrentActionCard');
export const getPendingUnknowns = defineQuery<string[]>('getPendingUnknowns');
export const getCurrentScore = defineQuery<number | undefined>('getCurrentScore');

export async function opportunityWorkflow(input: OpportunityWorkflowInput): Promise<void> {
  const state: OpportunityWorkflowState = input.restoredState ?? {
    status: 'target_identified', pendingUnknowns: [], pendingInteractionIds: [], processedInteractionIds: [], pendingResearchRequests: [],
    paused: false, budgetReviewRequired: false, revisionCount: 0, lastProcessedSignalSequence: 0,
  };
  const decisionQueue: ActionCardDecisionSignal[] = [];
  let pendingBudget: OpportunityBudgetUpdatedSignal | undefined;
  let pendingPriority: PriorityChangedSignal | undefined;

  const signalReceived = (): void => { state.lastProcessedSignalSequence += 1; };
  setHandler(getOpportunityProgress, () => state);
  setHandler(getCurrentActionCard, () => ({ ...(state.currentActionCardId ? { actionCardId: state.currentActionCardId } : {}), ...(state.currentActionCardVersionNo ? { versionNo: state.currentActionCardVersionNo } : {}) }));
  setHandler(getPendingUnknowns, () => state.pendingUnknowns);
  setHandler(getCurrentScore, () => state.currentScore);
  setHandler(actionCardDecision, (signal) => { decisionQueue.push(signal); signalReceived(); });
  setHandler(interactionRecorded, (signal) => { if (!state.pendingInteractionIds.includes(signal.interactionId) && !state.processedInteractionIds.includes(signal.interactionId)) state.pendingInteractionIds.push(signal.interactionId); signalReceived(); });
  setHandler(manualResearchRequested, (signal) => { if (!state.pendingResearchRequests.some((request) => request.requestId === signal.requestId)) state.pendingResearchRequests.push({ requestId: signal.requestId, ...(signal.focus ? { focus: signal.focus } : {}) }); signalReceived(); });
  setHandler(opportunityPauseRequested, () => { state.paused = true; signalReceived(); });
  setHandler(opportunityResumeRequested, () => { state.paused = false; signalReceived(); });
  setHandler(priorityChanged, (signal) => { pendingPriority = signal; signalReceived(); });
  setHandler(opportunityBudgetUpdated, (signal) => { pendingBudget = signal; state.budgetReviewRequired = false; signalReceived(); });

  const scope = (activityType: string, businessId = input.opportunityId, extra: Record<string, string> = {}) => ({ ...activityScope(input, activityType, businessId, { opportunityId: input.opportunityId, ...extra }), opportunityId: input.opportunityId });
  const report = async (milestone: string, actionCardId?: string): Promise<void> => activities.reportOpportunityMilestone({ ...scope('reportOpportunityMilestone', milestone), workflowId: workflowInfo().workflowId, milestone, opportunityStatus: state.status, ...(actionCardId ? { actionCardId } : {}), occurredAt: new Date().toISOString() });
  const run = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
    while (true) {
      if (state.paused) await condition(() => !state.paused);
      state.currentStep = name;
      try {
        const result = await task();
        state.currentStep = undefined;
        return result;
      } catch (error) {
        if (!isBudgetFailure(error)) throw error;
        state.budgetReviewRequired = true;
        if (!state.pendingUnknowns.includes('MISSION_BUDGET_EXHAUSTED')) state.pendingUnknowns.push('MISSION_BUDGET_EXHAUSTED');
        state.currentStep = undefined;
        await condition(() => pendingBudget !== undefined);
        pendingBudget = undefined;
        state.budgetReviewRequired = false;
        state.pendingUnknowns = state.pendingUnknowns.filter((item) => item !== 'MISSION_BUDGET_EXHAUSTED');
      }
    }
  };

  if (!state.currentActionCardId) {
    await activities.loadOpportunity(scope('loadOpportunity'));
    await run('resolveEntity', () => activities.resolveEntity(scope('resolveEntity')));
    state.status = 'target_identified';
    await run('mapStakeholders', () => activities.mapStakeholders(scope('mapStakeholders')));
    state.status = 'stakeholder_mapped';
    await report('stakeholder_mapped');
    const contactPointIds = await run('findContactPaths', () => activities.findContactPaths(scope('findContactPaths')));
    state.status = 'contact_path_found';
    await Promise.all(contactPointIds.map((contactPointId) => run(`verifyContactPoint:${contactPointId}`, () => activities.verifyContactPoint({ ...scope('verifyContactPoint', contactPointId, { contactPointId }), contactPointId }))));
    state.status = 'contact_path_verified';
    await report('contact_path_verified');
    const qualification = await run('qualifyOpportunity', () => activities.qualifyOpportunity(scope('qualifyOpportunity')));
    state.currentScore = qualification.score;
    state.pendingUnknowns = qualification.unknowns;
    const card = await run('buildActionCard', () => activities.buildActionCard(scope('buildActionCard')));
    state.currentActionCardId = card.actionCardId;
    state.currentActionCardVersionNo = card.versionNo;
    state.status = 'action_ready';
    await report('action_ready', card.actionCardId);
  }

  while (state.status === 'action_ready') {
    await condition(() => decisionQueue.length > 0 || state.pendingResearchRequests.length > 0 || state.paused);
    if (state.paused) {
      await report('paused');
      await condition(() => !state.paused);
    }
    while (state.pendingResearchRequests.length > 0) {
      const research = state.pendingResearchRequests.shift()!;
      await run(`manualResearch:${research.requestId}`, () => activities.runFocusedOpportunityResearch({ ...scope('runFocusedOpportunityResearch', research.requestId), ...(research.focus ? { focus: research.focus } : {}) }));
      const card = await run('buildActionCardAfterResearch', () => activities.buildActionCard({ ...scope('buildActionCard', research.requestId), basedOnVersionNo: state.currentActionCardVersionNo }));
      state.currentActionCardId = card.actionCardId;
      state.currentActionCardVersionNo = card.versionNo;
      state.revisionCount += 1;
      await report('action_ready', card.actionCardId);
    }
    const decision = decisionQueue.shift();
    if (!decision || decision.actionCardId !== state.currentActionCardId || decision.expectedVersionNo !== state.currentActionCardVersionNo) continue;
    await activities.recordActionCardDecision({ ...scope('recordActionCardDecision', decision.actionCardId, { actionCardId: decision.actionCardId }), ...decision });
    if (decision.decision === 'approve') {
      state.status = 'approved';
      await report('approved', decision.actionCardId);
      break;
    }
    const revised = await run('buildActionCardRevision', () => activities.buildActionCard({ ...scope('buildActionCard', `${decision.actionCardId}:${decision.expectedVersionNo}`), basedOnVersionNo: decision.expectedVersionNo, feedbackRefs: [decision.actionCardId], ...(decision.comment ? { feedbackComment: decision.comment } : {}) }));
    state.currentActionCardId = revised.actionCardId;
    state.currentActionCardVersionNo = revised.versionNo;
    state.revisionCount += 1;
    await report('action_ready', revised.actionCardId);
  }

  while (!['won', 'lost', 'archived'].includes(state.status)) {
    await condition(() => state.pendingInteractionIds.length > 0 || state.pendingResearchRequests.length > 0 || state.paused || pendingPriority !== undefined || workflowInfo().continueAsNewSuggested);
    if (state.paused) { await report('paused'); await condition(() => !state.paused); }
    if (pendingPriority) pendingPriority = undefined;
    while (state.pendingResearchRequests.length > 0) {
      const research = state.pendingResearchRequests.shift()!;
      await run(`manualResearch:${research.requestId}`, () => activities.runFocusedOpportunityResearch({ ...scope('runFocusedOpportunityResearch', research.requestId), ...(research.focus ? { focus: research.focus } : {}) }));
    }
    const interactionId = state.pendingInteractionIds.shift();
    if (interactionId) {
      const interpretation = await run(`interpretInteraction:${interactionId}`, () => activities.interpretInteraction({ ...scope('interpretInteraction', interactionId, { interactionId }), interactionId }));
      const applied = await run(`applyInteractionInterpretation:${interactionId}`, () => activities.applyInteractionInterpretation({ ...scope('applyInteractionInterpretation', interactionId, { interactionId }), interactionId, interpretation }));
      state.status = applied.status;
      state.processedInteractionIds.push(interactionId);
      if (applied.regenerateActionCard) {
        const regenerated = await run('buildActionCardFromInteraction', () => activities.buildActionCard({ ...scope('buildActionCard', interactionId), basedOnVersionNo: state.currentActionCardVersionNo, feedbackRefs: applied.feedbackRefs }));
        state.currentActionCardId = regenerated.actionCardId;
        state.currentActionCardVersionNo = regenerated.versionNo;
        state.revisionCount += 1;
      }
      await report(`interaction:${state.status}`, state.currentActionCardId);
    }
    if (workflowInfo().historyLength > 10_000 || workflowInfo().continueAsNewSuggested) await continueAsNew<typeof opportunityWorkflow>({ ...input, restoredState: state });
  }
  await activities.closeOpportunity(scope('closeOpportunity'));
  await report('closed', state.currentActionCardId);
}
