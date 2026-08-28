import { fileURLToPath } from 'node:url';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actionCardDecision, interactionRecorded, opportunityWorkflow } from '../opportunity-workflow.js';

const ids = {
  tenant: '30000000-0000-4000-8000-000000000001', mission: '30000000-0000-4000-8000-000000000002', opportunity: '30000000-0000-4000-8000-000000000003',
  card: '30000000-0000-4000-8000-000000000004', interaction: '30000000-0000-4000-8000-000000000005', user: '30000000-0000-4000-8000-000000000006', evidence: '30000000-0000-4000-8000-000000000007', contact: '30000000-0000-4000-8000-000000000008',
};

describe('opportunity workflow', () => {
  let environment: TestWorkflowEnvironment;
  beforeAll(async () => { environment = await TestWorkflowEnvironment.createTimeSkipping(); });
  afterAll(async () => { await environment.teardown(); });

  it('queues an interaction, applies interpretation and closes a won opportunity', async () => {
    const taskQueue = `opportunity-test-${crypto.randomUUID()}`;
    const activities = {
      loadOpportunity: () => Promise.resolve({ id: ids.opportunity, status: 'target_identified' }),
      resolveEntity: () => Promise.resolve({ id: ids.opportunity, status: 'succeeded' as const }),
      mapStakeholders: () => Promise.resolve({ id: ids.opportunity, status: 'succeeded' as const }),
      findContactPaths: () => Promise.resolve([ids.contact]),
      verifyContactPoint: () => Promise.resolve({ id: ids.contact, status: 'succeeded' as const }),
      qualifyOpportunity: () => Promise.resolve({ score: 82, status: 'contact_path_verified', unknowns: [] }),
      buildActionCard: () => Promise.resolve({ actionCardId: ids.card, versionNo: 1 }),
      reportOpportunityMilestone: () => Promise.resolve(),
      recordActionCardDecision: () => Promise.resolve(),
      interpretInteraction: () => Promise.resolve({ interactionId: ids.interaction, interactionEvidenceRef: ids.evidence, extractedFacts: [], contactUpdates: [], routeUpdates: [], opportunityTransition: { expectedFrom: 'approved' as const, to: 'won' as const, trigger: 'win_recorded' as const, evidenceRefs: [ids.evidence], reason: 'fixture won' }, nextAction: { regenerateActionCard: false, objective: 'Close opportunity' }, unresolvedQuestions: [] }),
      applyInteractionInterpretation: () => Promise.resolve({ status: 'won' as const, regenerateActionCard: false, feedbackRefs: [] }),
      closeOpportunity: () => Promise.resolve(),
    };
    const worker = await Worker.create({ connection: environment.nativeConnection, taskQueue, workflowsPath: fileURLToPath(new URL('../workflow-entry.ts', import.meta.url)), activities });
    const handle = await environment.client.workflow.start(opportunityWorkflow, { taskQueue, workflowId: `opportunity-test-${crypto.randomUUID()}`, args: [{ tenantId: ids.tenant, missionId: ids.mission, opportunityId: ids.opportunity }] });
    await handle.signal(actionCardDecision, { actionCardId: ids.card, decision: 'approve', decidedByUserId: ids.user, expectedVersionNo: 1 });
    await handle.signal(interactionRecorded, { interactionId: ids.interaction, recordedByUserId: ids.user });
    await worker.runUntil(handle.result());
    await expect(handle.result()).resolves.toBeUndefined();
  });
});
