/** Disposable PostgreSQL only. Never consumes DATABASE_URL or an existing business DB. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { EcosystemController } from '../../apps/api/src/market/ecosystem.controller.js';
import { Worker } from '@temporalio/worker';
import { controlledProvider, controlledConnectors } from './controlled-boundaries.mts';
import { skillCatalog, executionControl } from '@imea/agents';
import { workflowInstances, outboxEvents, missionProgressReadModel, timelineReadModel } from '@imea/database';
import { sql } from 'drizzle-orm';
import { Projector } from '../../apps/projector/src/projector.js';
import { actionCards, contactPoints, targetAssessments, opportunities } from '@imea/database';
import { executionInterceptor } from '../../apps/worker/src/execution-interceptor.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { isolatedDatabase } from './isolated-database.mts';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import JSZip from 'jszip';
import { createDatabaseClient, TransactionManager, ArtifactRepository, AgentContextRepository, agentRuns, artifacts, artifactVersions, missions, tenants, users, type DatabaseClient } from '@imea/database';
import { AgentRunner, ContextBuilder, PromptRegistry, ToolRegistry, OpenAIAgentsModelProvider, missionCompilerSkill, deterministicAgentFixtures } from '@imea/agents';
import { createMissionRequestSchema } from '@imea/contracts';
import { ObjectStorageConnector } from '@imea/connectors';
import { TemporalGateway } from '@imea/workflows';
import { clearEnvironmentCache } from '@imea/config';
import { DatabaseRunStore } from '../../apps/worker/src/run-store.js';
import { ActivityService } from '../../apps/worker/src/activities.js';
import { MarketService } from '../../apps/api/src/market/market.service.js';
import { MissionExportService } from '../../apps/api/src/market/export.service.js';
import { MissionsController } from '../../apps/api/src/market/missions.controller.js';
import { EventStreamService } from '../../apps/api/src/common/event-stream.service.js';

const auth = { tenantId: '21000000-0000-4000-8000-000000000001', userId: '21000000-0000-4000-8000-000000000002', email: 'isolated@test.invalid', role: 'owner' as const };
describe('actual API/Compiler/persistence/export boundaries (full A10 business chain is a separate gate)', () => {
  let container: { stop: () => Promise<unknown> } | undefined;
  let database: DatabaseClient;
  let apiDatabase: DatabaseClient;
  let workerDatabase: DatabaseClient;
  let projectorDatabase: DatabaseClient;
  let environment: TestWorkflowEnvironment | undefined;
  let temporal: TemporalGateway;
  let service: ActivityService;
  let controller: MissionsController;
  let transactions: TransactionManager;
  let storage: ObjectStorageConnector;
  let market: MarketService;
  const legacyId = '21000000-0000-4000-8000-000000000099';
  let httpRequests = 0;
  let invalidOutput = false;
  beforeAll(async () => {
    // The URL is created here and cannot point at the development business DB.
    const isolated = await isolatedDatabase();
    container = isolated;
    database = isolated.database;
    for (const file of ['0000_initial', '0001_rls', '0002_service_roles_and_rls', '0003_contact_evidence_chain', '0004_domain_event_projection', '0005_interaction_feedback', '0006_bm1_vertical_slice']) {
      await database.sql.unsafe(await readFile(new URL(`../../packages/database/migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
    await database.db.insert(tenants).values({ id: auth.tenantId, name: 'Isolated acceptance', slug: 'isolated-module-correction' });
    await database.db.insert(users).values({ id: auth.userId, email: auth.email, displayName: 'Acceptance', passwordHash: 'not-login-capable' });
    await database.sql`insert into missions(id,tenant_id,name,company_name,company_website,product_scope,target_countries,target_industries,target_profiles,objective,success_definition,output_languages,budget_config,created_by) values (${legacyId},${auth.tenantId},'迁移前任务','历史主体','https://legacy.test','valves',ARRAY['DE'],ARRAY['industrial'],'[]'::jsonb,'research','target',ARRAY['zh-CN'],'{}'::jsonb,${auth.userId})`;
    await database.sql.unsafe(await readFile(new URL('../../packages/database/migrations/0007_module_correction.sql', import.meta.url), 'utf8'));
    const runtimeDatabase = async (role: 'imea_api' | 'imea_worker' | 'imea_projector') => {
      await database.sql.unsafe(`ALTER ROLE ${role} LOGIN PASSWORD 'isolated-role-only'`);
      const url = new URL(isolated.url); url.username = role; url.password = 'isolated-role-only';
      return createDatabaseClient(url.href, 8);
    };
    apiDatabase = await runtimeDatabase('imea_api'); workerDatabase = await runtimeDatabase('imea_worker'); projectorDatabase = await runtimeDatabase('imea_projector');
    environment = await TestWorkflowEnvironment.createTimeSkipping();
    temporal = await TemporalGateway.connect(environment.address, 'default', 'isolated-module-correction');
    transactions = new TransactionManager(apiDatabase.db);
    for (const [key, value] of Object.entries({ JWT_SECRET: 'isolated-test-secret-32-characters-long', COOKIE_SECRET: 'isolated-test-secret-32-characters-long', ENCRYPTION_KEY: 'isolated-test-secret-32-characters-long', S3_ENDPOINT: 'http://127.0.0.1:1', S3_BUCKET: 'isolated', S3_ACCESS_KEY: 'isolated', S3_SECRET_KEY: 'isolated', MOCK_CONNECTORS: 'false', MOCK_MODEL_PROVIDER: 'false' })) vi.stubEnv(key, value);
    clearEnvironmentCache();
    storage = new ObjectStorageConnector({ endpoint: 'http://127.0.0.1:1', region: 'us-east-1', bucket: 'isolated', accessKeyId: 'isolated', secretAccessKey: 'isolated', forcePathStyle: true });
    const runner = new AgentRunner(new OpenAIAgentsModelProvider('offline', 'https://offline.invalid/v1'), 'controlled-test', new ToolRegistry(new Map()), new PromptRegistry(), new ContextBuilder(new AgentContextRepository(workerDatabase.db)), new DatabaseRunStore(workerDatabase.db, 'controlled-test'), [missionCompilerSkill]);
    service = new ActivityService(workerDatabase.db, runner, storage, new Map(), temporal);
    market = new MarketService(apiDatabase.db, transactions, temporal, storage, new EventStreamService(apiDatabase));
    controller = new MissionsController(market, new MissionExportService(transactions));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { if (temporal) await temporal.close(); if (environment) await environment.teardown(); for (const client of [apiDatabase, workerDatabase, projectorDatabase, database]) if (client) await client.close(); if (container) await container.stop(); vi.unstubAllEnvs(); clearEnvironmentCache(); });

  function controlledTransport() {
    vi.stubGlobal('fetch', vi.fn(async () => {
      httpRequests++;
      const output = missionCompilerSkill.outputSchema.parse(structuredClone(deterministicAgentFixtures.get('mission_compiler'))) as { result: { knownFacts: string[] }; proposedClaims: unknown[] };
      output.result.knownFacts = [];
      output.proposedClaims = invalidOutput ? [{ claimType: 'capability', statement: 'Unsupported manufacturer', value: {}, confidence: 90, evidenceRefs: ['not-a-uuid'], impactLevel: 'high' }] : [];
      return new Response(JSON.stringify({ id: 'resp_isolated', object: 'response', created_at: 0, status: 'completed', model: 'controlled-test', output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  }
  function missionInput() {
    return createMissionRequestSchema.parse({ name: '喀山客户研究（隔离测试）', productScope: '阀门', targetCountries: ['RU'], targetIndustries: ['流体设备'], targetProfiles: [{ type: 'integrator', description: '集成商' }], objective: '客户研究', successDefinition: '一个客户', outputLanguages: ['zh-CN'], budgetConfig: {}, researchDefinition: { version: 1, commissioningParty: { name: '温州和平广告', website: 'https://51heping.com' }, supplier: null, supplierAssessment: 'not_evaluated', products: ['阀门'], regions: [{ level: 'city', countryCode: 'RU', city: '喀山' }], customerRoles: ['integrator'], provenance: 'user_statement' } });
  }
  const create = () => controller.create(auth, missionInput());
  const scoped = (missionId: string) => ({ tenantId: auth.tenantId, missionId, correlationId: crypto.randomUUID(), idempotencyKey: `compiler:${missionId}` });

  it('retains a failed generation and known usage after the business validator rejects it', async () => {
    const mission = await create(); controlledTransport(); invalidOutput = true;
    await expect(service.compileMission(scoped(mission.id))).rejects.toThrow(); invalidOutput = false;
    const runs = await database.db.select().from(agentRuns).where(eq(agentRuns.missionId, mission.id));
    expect(runs).toHaveLength(1); expect(runs[0]).toMatchObject({ status: 'failed', inputTokens: 10, outputTokens: 20, costAmount: null });
    expect(await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id))).toHaveLength(0);
  });
  it('preserves independent started audit if the outer business transaction rolls back', async () => {
    const mission = await create();
    const store = new DatabaseRunStore(database.db, 'controlled-test');
    await expect(transactions.run(auth.tenantId, async () => {
      await store.start({ tenantId: auth.tenantId, missionId: mission.id, skillKey: 'mission_compiler', objective: 'test', artifactRefs: [], knownClaims: [], openQuestions: [], toolPermissions: [], budget: { maxSearchCalls: 0, maxBrowserPages: 0, maxModelTokens: 10000 }, outputLanguage: 'zh-CN' }, 'mission_compiler', 'controlled-test', 1);
      throw new Error('injected rollback before terminal audit');
    })).rejects.toThrow('injected rollback');
    const [run] = await database.db.select().from(agentRuns).where(eq(agentRuns.missionId, mission.id));
    expect(run).toMatchObject({ status: 'running', completedAt: null, inputTokens: null, outputTokens: null, costAmount: null });
  });
  it('reuses validated output after a failed business commit and deduplicates a lost response replay', async () => {
    const mission = await create(); controlledTransport(); const scope = scoped(mission.id); const before = httpRequests;
    vi.spyOn(ArtifactRepository.prototype, 'writeProposal').mockRejectedValueOnce(new Error('injected business rollback'));
    await expect(service.compileMission(scope)).rejects.toThrow('injected business rollback');
    const first = await service.compileMission(scope);
    // The response is deliberately discarded, then the same logical operation is replayed.
    expect(await service.compileMission(scope)).toEqual(first);
    expect(httpRequests - before).toBe(1);
    const rows = await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id));
    expect(rows).toHaveLength(1);
    expect(await database.db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, rows[0]!.id))).toHaveLength(1);
  });
  it('downloads a Chinese Mission through its actual controller and verifies persisted scope and zero-target diagnostics', async () => {
    const mission = await create();
    const app = Fastify();
    app.get('/api/v1/missions/:missionId/export', (_request, reply) => controller.exportMission(auth, mission.id, reply));
    try {
      const response = await app.inject({ method: 'GET', url: `/api/v1/missions/${mission.id}/export` });
      expect(response.statusCode).toBe(200); expect(response.headers['content-disposition']).toContain("filename*=UTF-8''");
      const zip = await JSZip.loadAsync(response.rawPayload);
      const manifest = JSON.parse(await zip.file('export-manifest.json')!.async('string'));
      expect(manifest).toMatchObject({ missionId: mission.id, resultKind: 'diagnostic_only', counts: { targetAssessments: 0, actionCards: 0 } });
      const reread = await controller.get(auth, mission.id);
      expect(JSON.parse(await zip.file('mission.json')!.async('string')).researchDefinition).toEqual(reread.researchDefinition);
    } finally { await app.close(); }
  });

  it('concurrent duplicate executions commit one artifact and one version', async () => {
    const mission = await create(); controlledTransport(); const scope = scoped(mission.id);
    const results = await Promise.all(Array.from({ length: 6 }, () => service.compileMission({ ...scope, correlationId: crypto.randomUUID() })));
    for (const result of results) expect(result).toEqual(results[0]);
    const rows = await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id));
    expect(rows).toHaveLength(1);
    expect(await database.db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, rows[0]!.id))).toHaveLength(1);
  });

  it('reads and exports pre-migration data without inventing supplier identity', async () => {
    const legacy = await controller.get(auth, legacyId);
    expect(legacy).toMatchObject({ name: '迁移前任务', researchDefinition: null, companyName: '历史主体' });
    const exported = await new MissionExportService(transactions).create(auth, legacyId);
    const zip = await JSZip.loadAsync(exported.bytes);
    expect(JSON.parse(await zip.file('mission.json')!.async('string')).researchDefinition).toBeNull();
  });

  it('cancellation during business writes rolls them back but retains generation audit', async () => {
    const mission = await create(); controlledTransport(); const scope = scoped(mission.id);
    const abort = new AbortController();
    const original = ArtifactRepository.prototype.writeProposal;
    let reached!: () => void; let release!: () => void;
    const writing = new Promise<void>(resolve => { reached = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(ArtifactRepository.prototype, 'writeProposal').mockImplementationOnce(async function (this: ArtifactRepository, ...args) {
      const result = await original.apply(this, args); reached(); await resume; return result;
    });
    const pending = executionControl.run({ signal: abort.signal }, () => service.compileMission(scope));
    await writing; abort.abort(new Error('controlled cancellation before commit')); release();
    await expect(pending).rejects.toThrow('controlled cancellation');
    expect(await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id))).toHaveLength(0);
    expect((await database.db.select().from(agentRuns).where(eq(agentRuns.missionId, mission.id)))[0]!.status).toBe('succeeded');
    const lateAbort = new AbortController();
    await executionControl.run({ signal: lateAbort.signal }, () => service.compileMission(scope));
    lateAbort.abort();
    expect(await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id))).toHaveLength(1);
  });

  it('recovers after PostgreSQL terminates the business connection without duplicating generation', async () => {
    const mission = await create(); controlledTransport(); const scope = scoped(mission.id); const before = httpRequests;
    const original = ArtifactRepository.prototype.writeProposal;
    vi.spyOn(ArtifactRepository.prototype, 'writeProposal').mockImplementationOnce(async function (this: ArtifactRepository, ...args) {
      await original.apply(this, args);
      const rows = await transactions.run(auth.tenantId, tx => tx.execute(sql`select pg_backend_pid() as pid`));
      await database.sql`select pg_terminate_backend(${rows[0]!.pid as number})`;
      throw new Error('Connection termination unexpectedly returned');
    });
    await expect(service.compileMission(scope)).rejects.toThrow();
    expect(await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id))).toHaveLength(0);
    await service.compileMission(scope);
    expect(httpRequests - before).toBe(1);
    expect((await database.db.select().from(agentRuns).where(eq(agentRuns.missionId, mission.id)))[0]!.executionAudit).toHaveProperty('validatedOutput.result');
    expect(await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id))).toHaveLength(1);
  });

  it('old Workflow cannot commit into the newer execution or reconcile its terminal state', async () => {
    const mission = await create(); controlledTransport();
    const workflowId = `mission:${auth.tenantId}:${mission.id}`;
    await database.db.insert(workflowInstances).values({ tenantId: auth.tenantId, missionId: mission.id, workflowType: 'mission', workflowId, runId: 'new-run', status: 'running' });
    await expect(executionControl.run({ workflowId, workflowRunId: 'old-run' }, () => service.compileMission(scoped(mission.id)))).rejects.toThrow('Stale Workflow');
    await expect(executionControl.run({ workflowId: `opportunity:${auth.tenantId}:old-child`, workflowRunId: 'child-run' }, () => service.compileMission({ ...scoped(mission.id), ownershipRunId: 'old-run' }))).rejects.toThrow('Stale Workflow');
    vi.spyOn(temporal, 'describeMission').mockResolvedValue({ status: 'RUNNING', runId: 'new-run' });
    await service.reconcileClosedMission(scoped(mission.id), { status: 'CANCELLED', runId: 'old-run' });
    expect((await controller.get(auth, mission.id)).status).toBe('draft');
    expect(await database.db.select().from(artifacts).where(eq(artifacts.missionId, mission.id))).toHaveLength(0);
  });

  it('projection replay preserves business state and deduplicates timeline entries', async () => {
    const mission = await create();
    const projector = new Projector(projectorDatabase, projectorDatabase.db);
    const batch = Reflect.get(projector, 'batch').bind(projector) as () => Promise<number>;
    while (await batch()) { /* drain actual outbox */ }
    const before = await database.db.select().from(timelineReadModel).where(eq(timelineReadModel.missionId, mission.id));
    await database.db.update(outboxEvents).set({ status: 'pending', publishedAt: null });
    while (await batch()) { /* replay actual events through projector */ }
    expect(await database.db.select().from(timelineReadModel).where(eq(timelineReadModel.missionId, mission.id))).toEqual(before);
    expect((await database.db.select().from(missionProgressReadModel).where(eq(missionProgressReadModel.missionId, mission.id)))[0]!.stage).toBe('draft');
  });

  it('reconciles beyond 1000 entries and measures end-to-end convergence separately from polling interval', async () => {
    const template = await create();
    const ids = Array.from({ length: 1005 }, () => crypto.randomUUID());
    // Initial pending state fixtures only; terminal business state is written by reconciliation.
    for (let offset = 0; offset < ids.length; offset += 100) await database.db.insert(missions).values(ids.slice(offset, offset + 100).map(id => ({ ...template, id, status: 'running' as const, currentStage: 'compiling' as const, workflowId: `mission:${auth.tenantId}:${id}` })));
    let yielded = 0;
    const gateway = Reflect.construct(TemporalGateway, [{}, { workflow: { async *list() {
      for (const id of ids) { yielded++; yield { workflowId: `mission:${auth.tenantId}:${id}`, runId: id, status: { name: 'CANCELLED' } }; }
    } } }, 'isolated']) as TemporalGateway;
    vi.spyOn(temporal, 'describeMission').mockImplementation(async (_tenant, id) => ({ runId: id, status: 'CANCELLED' }));
    const startedAt = Date.now();
    await new Promise(resolve => setTimeout(resolve, 15000));
    const processingStartedAt = Date.now();
    let processed = 0;
    for await (const row of gateway.closedMissions()) { await service.reconcileClosedMission(scoped(row.missionId), row); processed++; }
    const completedAt = Date.now();
    const [count] = await database.sql`select count(*)::int as n from missions where id = any(${ids}) and status = 'failed'`;
    expect(count!.n).toBe(1005); expect(processed).toBe(1005); expect(yielded).toBe(1005);
    await writeFile('reconciliation-measurement.json', JSON.stringify({ controlledTemporalListing: true, actualDatabase: true, count: processed, pollIntervalMs: 15000, observedInitialWaitMs: processingStartedAt - startedAt, processingMs: completedAt - processingStartedAt, observedConvergenceMs: completedAt - startedAt }, null, 2));
  }, 180000);

  it('A10: API start → actual Worker/Workflow → target/contact/pending card → reread/export', async () => {
    const input = missionInput(); input.name = 'A10 喀山隔离工程验收（受控响应）';
    let mission: typeof missions.$inferSelect;
    const runner = new AgentRunner(controlledProvider, 'controlled-test', new ToolRegistry(controlledConnectors), new PromptRegistry(), new ContextBuilder(new AgentContextRepository(workerDatabase.db)), new DatabaseRunStore(workerDatabase.db, 'controlled-test'), skillCatalog);
    const realActivities = new ActivityService(workerDatabase.db, runner, storage, controlledConnectors, temporal);
    const activities = Object.fromEntries(Object.getOwnPropertyNames(ActivityService.prototype).filter(key => key !== 'constructor' && typeof realActivities[key as keyof ActivityService] === 'function').map(key => [key, (realActivities[key as keyof ActivityService] as Function).bind(realActivities)]));
    const worker = await Worker.create({ connection: environment!.nativeConnection, namespace: 'default', taskQueue: 'isolated-module-correction', workflowsPath: fileURLToPath(new URL('../../packages/workflows/src/workflow-entry.ts', import.meta.url)), activities, interceptors: { activity: [executionInterceptor] } });
    const waitFor = async (predicate: () => Promise<boolean>) => { const deadline = Date.now() + 90000; while (!await predicate()) { if (Date.now() > deadline) throw new Error('A10 stage deadline exceeded'); await new Promise(resolve => setTimeout(resolve, 200)); } };
    // Fixed isolated principal; authentication itself is outside this engineering gate.
    class AcceptanceModule {}
    // esbuild does not emit constructor metadata; production tsc does. Use the same constructor types.
    Reflect.defineMetadata('design:paramtypes', [MarketService, MissionExportService], MissionsController);
    Reflect.defineMetadata('design:paramtypes', [MarketService], EcosystemController);
    Module({ controllers: [MissionsController, EcosystemController], providers: [{ provide: MarketService, useValue: market }, { provide: MissionExportService, useValue: new MissionExportService(transactions) }] })(AcceptanceModule);
    const adapter = new FastifyAdapter();
    const nest = await NestFactory.create(AcceptanceModule, adapter, { logger: false });
    nest.useGlobalGuards({ canActivate(context) { context.switchToHttp().getRequest<{ auth: typeof auth }>().auth = auth; return true; } });
    await nest.init(); const app = adapter.getInstance(); await app.ready();
    const created = await app.inject({ method: 'POST', url: '/api/v1/missions', payload: input });
    expect(created.statusCode).toBe(201); mission = created.json();
    await worker.runUntil(async () => {
      expect((await app.inject({ method: 'POST', url: `/api/v1/missions/${mission.id}/start` })).statusCode).toBe(201);
      await waitFor(async () => (await controller.get(auth, mission.id)).currentStage === 'awaiting_route_review');
      const routes = await controller.routes(auth, mission.id);
      expect((await app.inject({ method: 'POST', url: `/api/v1/missions/${mission.id}/routes/review-complete`, payload: { approvedRouteIds: [routes[0]!.id], acceptedArtifactVersionIds: [routes[0]!.artifactVersionId] } })).statusCode).toBe(201);
      await waitFor(async () => (await controller.get(auth, mission.id)).currentStage === 'awaiting_target_review');
      const targets = await market.targets(auth, mission.id);
      expect(targets).toHaveLength(3);
      expect((await app.inject({ method: 'POST', url: `/api/v1/missions/${mission.id}/targets/review-complete`, payload: { selectedTargetIds: [targets[0]!.entity.id] } })).statusCode).toBe(201);
      await waitFor(async () => (await database.db.select({ card: actionCards }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(eq(opportunities.missionId, mission.id))).length > 0);
      await waitFor(async () => (await controller.get(auth, mission.id)).currentStage === 'awaiting_action_review');
      const cards = await database.db.select({ card: actionCards }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(eq(opportunities.missionId, mission.id));
      expect(cards).toHaveLength(1); expect(cards[0]!.card.status).toBe('review');
      const contacts = await database.db.select().from(contactPoints).where(eq(contactPoints.missionId, mission.id));
      expect(contacts[0]).toMatchObject({ value: 'https://target-01.example/contact', verificationStatus: 'source_confirmed' });
      expect(await database.db.select().from(targetAssessments).where(eq(targetAssessments.missionId, mission.id))).toHaveLength(3);
      const exported = await new MissionExportService(transactions).create(auth, mission.id);
      const zip = await JSZip.loadAsync(exported.bytes);
      const manifest = JSON.parse(await zip.file('export-manifest.json')!.async('string'));
      expect(manifest).toMatchObject({ missionId: mission.id, counts: { targetAssessments: 3, actionCards: 1 } });
      for (const [name, expected] of Object.entries(manifest.fileHashes)) expect(createHash('sha256').update(await zip.file(name)!.async('nodebuffer')).digest('hex')).toBe(expected);
      expect((await app.inject({ method: 'GET', url: `/api/v1/missions/${mission.id}` })).json().id).toBe(mission.id);
      const download = await app.inject({ method: 'GET', url: `/api/v1/missions/${mission.id}/export` });
      expect(download.statusCode).toBe(200);
      expect(download.headers['content-disposition']).toContain("filename*=UTF-8''");
      const downloaded = await JSZip.loadAsync(download.rawPayload);
      const downloadedManifest = JSON.parse(await downloaded.file('export-manifest.json')!.async('string'));
      // Export itself appends exactly one audit event; business content is unchanged.
      expect(downloadedManifest.counts).toEqual({ ...manifest.counts, domainEvents: manifest.counts.domainEvents + 1 });
      await writeFile(`a10-${mission.id}.zip`, exported.bytes);
      await writeFile(`a10-${mission.id}.json`, JSON.stringify({ result: 'CONTROLLED_A10_PASS', realRegionalBusinessPass: false, missionId: mission.id, workflow: await temporal.describeMission(auth.tenantId, mission.id), targets: await market.targets(auth, mission.id), contacts, cards, runs: (await database.db.select().from(agentRuns).where(eq(agentRuns.missionId, mission.id))).map(run => ({ id: run.id, skill: run.skillKey, status: run.status, model: run.modelName, inputTokens: run.inputTokens, outputTokens: run.outputTokens, cost: run.costAmount })), export: { filename: `a10-${mission.id}.zip`, sha256: createHash('sha256').update(exported.bytes).digest('hex'), manifest } }, null, 2));
      await environment!.client.workflow.getHandle(`mission:${auth.tenantId}:${mission.id}`).cancel();
      await waitFor(async () => (await temporal.describeMission(auth.tenantId, mission.id)).status === 'CANCELLED');
      const terminal = await temporal.describeMission(auth.tenantId, mission.id);
      await realActivities.reconcileClosedMission(scoped(mission.id), terminal);
      expect((await controller.get(auth, mission.id)).status).toBe('failed');
      expect((await database.db.select().from(actionCards).where(eq(actionCards.id, cards[0]!.card.id)))[0]!.status).toBe('review');
      await writeFile(`a10-${mission.id}-cleanup.json`, JSON.stringify({ reason: 'isolated test cleanup after export', workflowStatus: terminal.status, persistedMissionStatus: 'failed', actionCardStatus: 'review' }, null, 2));
    });
    await nest.close();
  }, 180000);
});
