import { fileURLToPath } from 'node:url';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { missionCompletionRequested, missionWorkflow } from '../mission-workflow.js';

const tenantId = '31000000-0000-4000-8000-000000000001';
const missionId = '31000000-0000-4000-8000-000000000002';
const userId = '31000000-0000-4000-8000-000000000003';

describe('mission workflow replay', () => {
  let environment: TestWorkflowEnvironment;
  beforeAll(async () => { environment = await TestWorkflowEnvironment.createTimeSkipping(); });
  afterAll(async () => { await environment.teardown(); });

  async function runFixture(): Promise<string[]> {
    const trace: string[] = [];
    const succeeded = (name: string) => { trace.push(name); return Promise.resolve({ id: `${name}-fixture`, status: 'succeeded' as const }); };
    const activities = {
      loadMission: () => {
        trace.push('loadMission');
        return Promise.resolve({ id: missionId, topTargetLimit: 10, budget: { maxTargets: 40, maxContactPaths: 160, maxSearchCalls: 80, maxBrowserPages: 120, maxAgentRuns: 200, maxModelTokens: 1_000_000, weeklyRefreshTargets: 20 } });
      },
      compileMission: async () => succeeded('compileMission'),
      ingestCompanySources: async () => succeeded('ingestCompanySources'),
      extractCapabilityClaims: async () => succeeded('extractCapabilityClaims'),
      researchMarketRoutes: async () => succeeded('researchMarketRoutes'),
      researchCompetitors: async () => succeeded('researchCompetitors'),
      researchExpertSignals: async () => succeeded('researchExpertSignals'),
      markMissionAwaitingRouteReview: () => { trace.push('markMissionAwaitingRouteReview'); return Promise.resolve(); },
      markMissionCompleted: () => { trace.push('markMissionCompleted'); return Promise.resolve(); },
    };
    const taskQueue = `mission-test-${crypto.randomUUID()}`;
    const worker = await Worker.create({ connection: environment.nativeConnection, taskQueue, workflowsPath: fileURLToPath(new URL('../workflow-entry.ts', import.meta.url)), activities });
    const handle = await environment.client.workflow.start(missionWorkflow, { taskQueue, workflowId: `mission-test-${crypto.randomUUID()}`, args: [{ tenantId, missionId }] });
    await handle.signal(missionCompletionRequested, { requestedByUserId: userId });
    await worker.runUntil(handle.result());
    return trace;
  }

  it('replays the same staged activity set and closes only after the explicit completion signal', async () => {
    const first = await runFixture();
    const second = await runFixture();
    expect([...first].sort()).toEqual([...second].sort());
    expect(first.slice(0, 3)).toEqual(['loadMission', 'compileMission', 'ingestCompanySources']);
    expect(first).toContain('markMissionAwaitingRouteReview');
    expect(first.indexOf('markMissionAwaitingRouteReview')).toBeLessThan(first.indexOf('markMissionCompleted'));
    expect(first.at(-1)).toBe('markMissionCompleted');
  });
});
