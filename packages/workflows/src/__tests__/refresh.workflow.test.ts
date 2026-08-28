import { fileURLToPath } from 'node:url';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refreshWorkflow } from '../refresh-workflow.js';

const ids = {
  tenant: '32000000-0000-4000-8000-000000000001', mission: '32000000-0000-4000-8000-000000000002', request: '32000000-0000-4000-8000-000000000003',
  sourceA: '32000000-0000-4000-8000-000000000004', sourceB: '32000000-0000-4000-8000-000000000005', contact: '32000000-0000-4000-8000-000000000006', competitor: '32000000-0000-4000-8000-000000000007',
  snapshot: '32000000-0000-4000-8000-000000000008', proposal: '32000000-0000-4000-8000-000000000009', opportunity: '32000000-0000-4000-8000-000000000010',
};

describe('refresh workflow replay', () => {
  let environment: TestWorkflowEnvironment;
  beforeAll(async () => { environment = await TestWorkflowEnvironment.createTimeSkipping(); });
  afterAll(async () => { await environment.teardown(); });

  async function runFixture() {
    const taskQueue = `refresh-test-${crypto.randomUUID()}`;
    const activities = {
      loadRefreshScope: () => Promise.resolve({ sourceIds: [ids.sourceA, ids.sourceB], contactPointIds: [ids.contact], competitorIds: [ids.competitor] }),
      refreshSource: ({ sourceId }: { sourceId: string }) => Promise.resolve(sourceId === ids.sourceA ? { changed: true, snapshotId: ids.snapshot } : { changed: false }),
      refreshContact: () => Promise.resolve({ id: ids.contact, status: 'succeeded' as const }),
      refreshCompetitor: () => Promise.resolve({ id: ids.competitor, status: 'succeeded' as const, metadata: { changed: true } }),
      createRefreshProposal: ({ changedSnapshotIds, reverifiedContactCount, changedCompetitorCount }: { changedSnapshotIds: string[]; reverifiedContactCount: number; changedCompetitorCount: number }) => Promise.resolve({ proposalId: ids.proposal, changedSourceCount: changedSnapshotIds.length, reverifiedContactCount, changedCompetitorCount, affectedOpportunityIds: [ids.opportunity] }),
    };
    const worker = await Worker.create({ connection: environment.nativeConnection, taskQueue, workflowsPath: fileURLToPath(new URL('../workflow-entry.ts', import.meta.url)), activities });
    const handle = await environment.client.workflow.start(refreshWorkflow, { taskQueue, workflowId: `refresh-test-${crypto.randomUUID()}`, args: [{ tenantId: ids.tenant, missionId: ids.mission, scheduledAt: '2026-08-28T00:00:00.000Z', requestId: ids.request, triggerType: 'manual' }] });
    return worker.runUntil(handle.result());
  }

  it('produces an identical proposal from identical manual refresh inputs', async () => {
    const first = await runFixture();
    const second = await runFixture();
    expect(first).toEqual(second);
    expect(first).toEqual({ proposalId: ids.proposal, changedSourceCount: 1, reverifiedContactCount: 1, changedCompetitorCount: 1, affectedOpportunityIds: [ids.opportunity] });
  });
});
