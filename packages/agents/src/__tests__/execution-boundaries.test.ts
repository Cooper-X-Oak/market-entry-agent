/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method -- Controlled async transport stubs and assertions on spy identity; no unbound method is invoked. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OpenAIAgentsModelProvider } from '../model-provider.js';
import { AgentRunner } from '../runner.js';
import { ContextBuilder } from '../context-builder.js';
import { PromptRegistry } from '../prompt-registry.js';
import { ToolRegistry } from '../tool-registry.js';
import { missionCompilerSkill, targetRankerSkill } from '../skills.js';
import { deterministicAgentFixtures } from '../mock-fixtures.js';
import { agentExecutionContextSchema, normalizeResearchDefinition, type AgentTaskInput } from '@imea/contracts';
import type { ProviderAttempt, RunStore } from '../types.js';

afterEach(() => vi.unstubAllGlobals());
const id = '20000000-0000-4000-8000-000000000001';
const evidenceId = '20000000-0000-4000-8000-000000000002';
const otherId = '20000000-0000-4000-8000-000000000003';
const task: AgentTaskInput = { tenantId: id, missionId: id, skillKey: 'mission_compiler', objective: '客户研究', artifactRefs: [], knownClaims: [], openQuestions: [], toolPermissions: [], budget: { maxSearchCalls: 0, maxBrowserPages: 0, maxModelTokens: 10000 }, outputLanguage: 'zh-CN' };
const definition = { version: 1, commissioningParty: { name: '温州和平广告', website: 'https://51heping.com' }, supplier: null, supplierAssessment: 'not_evaluated', products: ['阀门'], regions: [{ level: 'city', countryCode: 'RU', city: 'Kazan' }], customerRoles: ['integrator'], provenance: 'user_statement' };
function context(withEvidence = false) {
  return agentExecutionContextSchema.parse({ contextVersion: 1, scope: { tenantId: id, missionId: id },
    mission: { id, companyName: '温州和平广告', companyWebsite: 'https://51heping.com', researchDefinition: definition,
      productScope: '阀门', targetCountries: ['RU'], targetIndustries: ['流体设备'], targetProfiles: [{ type: 'integrator', description: '集成商' }], objective: '客户研究', successDefinition: '一个公开客户', outputLanguages: ['zh-CN'], budget: {}, stage: 'compiling' },
    routes: [], stakeholders: [], contacts: [], interactions: [], claims: [], artifacts: [], feedback: [], openQuestions: [],
    evidence: withEvidence ? [{ evidenceId, sourceId: id, sourceSnapshotId: otherId, sourceType: 'company_website', url: 'https://51heping.com', fetchedAt: new Date().toISOString(), contentHash: 'regression-only', excerpt: 'Industrial branding agency', locator: { selector: '#about' }, stance: 'support', authority: 'official_organization', independentGroupKey: '51heping.com', freshness: 100, relevance: 100 }] : [],
    execution: { skillKey: task.skillKey, objective: task.objective, outputLanguage: task.outputLanguage, toolPermissions: [], budgetRemaining: {}, correlationId: id },
  });
}
function output() {
  const value = missionCompilerSkill.outputSchema.parse(structuredClone(deterministicAgentFixtures.get('mission_compiler'))) as { result: { knownFacts: string[] }; proposedClaims: unknown[] };
  value.result.knownFacts = []; value.proposedClaims = [];
  return value;
}
function response(value: unknown) {
  return new Response(JSON.stringify({ id: 'resp_regression', object: 'response', created_at: 0, status: 'completed', model: 'test', output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } }), { status: 200, headers: { 'content-type': 'application/json' } });
}
function store() {
  const attempts: ProviderAttempt[] = [];
  const runStore: RunStore = { start: vi.fn(async () => ({ id, input: task, skillKey: task.skillKey, modelName: 'test', promptVersion: 1 })),
    toolStarted: vi.fn(async () => id), toolCompleted: vi.fn(async () => {}), toolFailed: vi.fn(async () => {}), contextReady: vi.fn(async () => {}),
    providerAttempt: vi.fn(async (_id: string, event: ProviderAttempt) => { attempts.push(event); }), complete: vi.fn(async () => {}), fail: vi.fn(async () => {}) };
  return { runStore, attempts };
}
function run(value: unknown, withEvidence = false, relation = 'unsupported', skill = missionCompilerSkill) {
  const audit = store();
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return response(body.text?.format?.name === 'evidence_content_review' ? { reviews: [{ key: 'result.proposedClaims[0].evidenceRefs', relation, reason: 'Controlled independent semantic verdict', quotes: [{ evidenceId, quote: 'Industrial branding agency' }] }] } : value);
  }); vi.stubGlobal('fetch', fetch);
  const runner = new AgentRunner(new OpenAIAgentsModelProvider('offline', 'https://offline.invalid/v1'), 'test', new ToolRegistry(new Map()), new PromptRegistry(), new ContextBuilder({ load: async () => context(withEvidence) }), audit.runStore, [skill]);
  return { result: runner.execute({ ...task, skillKey: skill.key }), fetch, ...audit };
}

describe('actual Compiler → Context → Provider → business validator boundary', () => {
  it('compiles user-only research without manufacturing capability facts', async () => {
    const execution = run(output());
    await execution.result;
    expect(execution.fetch).toHaveBeenCalledTimes(1);
    expect(execution.runStore.complete).toHaveBeenCalledOnce();
    expect(normalizeResearchDefinition(context().mission)).toMatchObject({ supplier: null, supplierAssessment: 'not_evaluated', regions: [{ level: 'city', city: 'Kazan' }] });
  });
  it.each(['not-a-uuid', otherId, evidenceId])('rejects unprovided evidence %s after one actual SDK request and retains usage', async reference => {
    const value = output(); value.proposedClaims = [{ claimType: 'capability', statement: 'Manufacturer', value: {}, confidence: 80, evidenceRefs: [reference], impactLevel: 'high' }];
    const execution = run(value);
    await expect(execution.result).rejects.toThrow();
    expect(execution.fetch).toHaveBeenCalledTimes(1);
    expect(execution.runStore.complete).not.toHaveBeenCalled();
    expect(execution.attempts.at(-1)).toMatchObject({ state: 'succeeded', usage: { inputTokens: 10, outputTokens: 20, costAmount: null } });
    expect(execution.runStore.fail).toHaveBeenCalledOnce();
  });
  it('rejects a valid UUID outside the loaded evidence set, including unapproved cross-Mission references', async () => {
    const value = output(); value.proposedClaims = [{ claimType: 'company', statement: 'Industrial branding agency', value: {}, confidence: 80, evidenceRefs: [otherId], impactLevel: 'low' }];
    await expect(run(value, true).result).rejects.toThrow('unknown_evidence');
  });
  it.each([['Manufacturer', false], ['Industrial branding agency', true]])('checks content support for a valid reference: %s', async (statement, accepted) => {
    const value = output(); value.proposedClaims = [{ claimType: 'company', statement, value: {}, confidence: 80, evidenceRefs: [evidenceId], impactLevel: 'low' }];
    const execution = run(value, true);
    if (accepted) await execution.result; else await expect(execution.result).rejects.toThrow('content_support_unverified');
  });
  it('accepts a reviewed translation through actual Runner and SDK, retaining a separate review run', async () => {
    const value = output(); value.proposedClaims = [{ claimType: 'company', statement: '工业品牌服务机构', value: {}, confidence: 80, evidenceRefs: [evidenceId], impactLevel: 'low' }];
    const execution = run(value, true, 'paraphrase');
    await execution.result;
    expect(execution.fetch).toHaveBeenCalledTimes(2);
    expect(execution.runStore.start).toHaveBeenCalledTimes(2);
    expect(execution.runStore.complete).toHaveBeenCalledTimes(2);
  });
  it('rejects unsupported Target Ranker rationale despite existing evidence IDs', async () => {
    const value = structuredClone(deterministicAgentFixtures.get('target_ranker')) as { result: { targets: Array<{ rationale: string; evidenceRefs: string[] }> } };
    value.result.targets = value.result.targets.slice(0, 3).map(target => ({ ...target, evidenceRefs: [evidenceId], rationale: 'This agency manufactures certified industrial valves' }));
    const execution = run(value, true, 'unsupported', targetRankerSkill);
    await expect(execution.result).rejects.toThrow('content_support_unverified');
    expect(execution.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('real SDK retry ownership and cancellation with controlled transport', () => {
  const input = { model: 'test', name: 'test', instructions: 'test', prompt: 'test', outputSchema: z.object({ ok: z.boolean() }), maxTurns: 1 };
  it.each([1, 9])('bounds HTTP requests when %i transient failures occur', async failures => {
    const events: ProviderAttempt[] = []; let count = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ++count <= failures ? new Response(JSON.stringify({ error: { message: 'controlled transient', type: 'server_error' } }), { status: 503, headers: { 'retry-after': '0' } }) : response({ ok: true })));
    const result = new OpenAIAgentsModelProvider('offline', 'https://offline.invalid/v1').generate({ ...input, onAttempt: async event => { events.push(event); } });
    if (failures === 1) await result; else await expect(result).rejects.toMatchObject({ code: 'PROVIDER_TRANSIENT' });
    expect(count).toBe(failures === 1 ? 2 : 3);
    expect(events.filter(event => event.state === 'started')).toHaveLength(count);
  });
  it('does not send after cancellation or audit intent failure', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const provider = new OpenAIAgentsModelProvider('offline', 'https://offline.invalid/v1');
    await expect(provider.generate({ ...input, signal: AbortSignal.abort() })).rejects.toThrow();
    await expect(provider.generate({ ...input, onAttempt: async () => { throw new Error('audit unavailable'); } })).rejects.toThrow('audit unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('propagates in-flight cancellation and never retries it', async () => {
    const controller = new AbortController(); let requests = 0;
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      requests++; init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); controller.abort();
    }));
    await expect(new OpenAIAgentsModelProvider('offline', 'https://offline.invalid/v1').generate({ ...input, signal: controller.signal })).rejects.toMatchObject({ code: 'EXECUTION_CANCELLED' });
    expect(requests).toBe(1);
  });
});
