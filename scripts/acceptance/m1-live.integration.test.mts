/** Disposable PostgreSQL only. Never consumes DATABASE_URL or an existing business DB. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { EcosystemController } from '../../apps/api/src/market/ecosystem.controller.js';
import { Worker } from '@temporalio/worker';
import { createAgentRuntime } from '../../apps/worker/src/agent-factory.js';
import { getEnvironment } from '@imea/config';
import { appendFile } from 'node:fs/promises';
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
    await writeFile('m1-live-database.json', JSON.stringify({ databaseName: new URL(isolated.url).pathname.slice(1), observedAt:new Date().toISOString() }));
    database = isolated.database;
    for (const file of ['0000_initial', '0001_rls', '0002_service_roles_and_rls', '0003_contact_evidence_chain', '0004_domain_event_projection', '0005_interaction_feedback', '0006_bm1_vertical_slice']) {
      await database.sql.unsafe(await readFile(new URL(`../../packages/database/migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
    await database.db.insert(tenants).values({ id: auth.tenantId, name: 'Isolated acceptance', slug: 'isolated-module-correction' });
    await database.db.insert(users).values({ id: auth.userId, email: auth.email, displayName: 'Acceptance', passwordHash: 'not-login-capable' });
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
    process.env.MOCK_CONNECTORS='false'; process.env.MOCK_MODEL_PROVIDER='false';
    clearEnvironmentCache();
    storage = createAgentRuntime(getEnvironment(), workerDatabase.db).storage;
    await storage.health();
    market = new MarketService(apiDatabase.db, transactions, temporal, storage, new EventStreamService(apiDatabase));
    controller = new MissionsController(market, new MissionExportService(transactions));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { if (temporal) await temporal.close(); if (environment) await environment.teardown(); for (const client of [apiDatabase, workerDatabase, projectorDatabase, database]) if (client) await client.close(); if (container) await container.stop(); vi.unstubAllEnvs(); clearEnvironmentCache(); });


  function missionInput() {
    return createMissionRequestSchema.parse({ name: '喀山客户研究（隔离测试）', productScope: '阀门', targetCountries: ['RU'], targetIndustries: ['流体设备'], targetProfiles: [{ type: 'integrator', description: '集成商' }], objective: '客户研究', successDefinition: '一个客户', outputLanguages: ['zh-CN'], budgetConfig: {}, researchDefinition: { version: 1, commissioningParty: { name: '温州和平广告', website: 'https://51heping.com' }, supplier: null, supplierAssessment: 'not_evaluated', products: ['阀门'], regions: [{ level: 'city', countryCode: 'RU', city: '喀山' }], customerRoles: ['integrator'], provenance: 'user_statement' } });
  }

  it('M1 real development run through actual application and worker', async () => {
    const input=missionInput(); input.name='M1 喀山真实开发验证 '+new Date().toISOString();
    input.targetProfiles=[{type:'distributor',description:'工业阀门潜在采购客户，兼顾库存商、工程承包商、集成商及终端用户'}];
    input.researchDefinition!.customerRoles=['distributor','stockist','epc','integrator','end_user'];
    // Parse again: input errors must be surfaced before starting any paid call.
    createMissionRequestSchema.parse(input);
    let mission: typeof missions.$inferSelect;
    const runtime=createAgentRuntime(getEnvironment(),workerDatabase.db);
    const realActivities=new ActivityService(workerDatabase.db,runtime.runner,runtime.storage,runtime.connectors,temporal);
    const activities = Object.fromEntries(Object.getOwnPropertyNames(ActivityService.prototype).filter(key => key !== 'constructor' && typeof realActivities[key as keyof ActivityService] === 'function').map(key => [key, (realActivities[key as keyof ActivityService] as Function).bind(realActivities)]));
    const worker = await Worker.create({ connection: environment!.nativeConnection, namespace: 'default', taskQueue: 'isolated-module-correction', workflowsPath: fileURLToPath(new URL('../../packages/workflows/src/workflow-entry.ts', import.meta.url)), activities, interceptors: { activity: [executionInterceptor] } });
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

    await writeFile('m1-live-input.json',JSON.stringify({missionId:mission.id,input},null,2));
    console.log('LIVE_MISSION_CREATED',mission.id);
    const snapshot=async(reason:string)=>{
      const current=await controller.get(auth,mission.id);
      const runs=await database.db.select().from(agentRuns).where(eq(agentRuns.missionId,mission.id));
      const exported=await new MissionExportService(transactions).create(auth,mission.id);
      await writeFile('m1-live-'+mission.id+'.zip',exported.bytes);
      await writeFile('m1-live-result.json',JSON.stringify({reason,mission:current,workflow:await temporal.describeMission(auth.tenantId,mission.id),runs,targets:await market.targets(auth,mission.id),contacts:await database.db.select().from(contactPoints).where(eq(contactPoints.missionId,mission.id)),cards:await database.db.select({card:actionCards}).from(actionCards).innerJoin(opportunities,eq(opportunities.id,actionCards.opportunityId)).where(eq(opportunities.missionId,mission.id)),export:{filename:'m1-live-'+mission.id+'.zip',sha256:createHash('sha256').update(exported.bytes).digest('hex')}},null,2));
    };
    const waitStage=async(stage:string)=>{
      const until=Date.now()+600000;let last='';
      while(Date.now()<until){
        const current=await controller.get(auth,mission.id);
        const desc=await temporal.describeMission(auth.tenantId,mission.id);
        if(current.currentStage!==last){last=current.currentStage;console.log('LIVE_STAGE',last);await appendFile('m1-live-progress.jsonl',JSON.stringify({at:new Date().toISOString(),stage:last,workflowStatus:desc.status})+'\n');}
        if(current.currentStage===stage)return;
        if(['FAILED','TERMINATED','CANCELLED','TIMED_OUT'].includes(desc.status))throw new Error('LIVE_WORKFLOW_'+desc.status+' at '+current.currentStage);
        await new Promise(r=>setTimeout(r,2000));
      }throw new Error('LIVE_STAGE_TIMEOUT '+stage);
    };
    try {await worker.runUntil(async()=>{
      try {
        expect((await app.inject({method:'POST',url:'/api/v1/missions/'+mission.id+'/start'})).statusCode).toBe(201);
        await waitStage('awaiting_route_review');
        await snapshot('route review reached');
        const routes=await controller.routes(auth,mission.id);if(!routes.length)throw new Error('No valid routes');
        expect((await app.inject({method:'POST',url:'/api/v1/missions/'+mission.id+'/routes/review-complete',payload:{approvedRouteIds:[routes[0]!.id],acceptedArtifactVersionIds:[routes[0]!.artifactVersionId]}})).statusCode).toBe(201);
        await waitStage('awaiting_target_review');
        await snapshot('target review reached');
        const targets=await market.targets(auth,mission.id);if(!targets.length)throw new Error('No valid targets');
        expect((await app.inject({method:'POST',url:'/api/v1/missions/'+mission.id+'/targets/review-complete',payload:{selectedTargetIds:[targets[0]!.entity.id]}})).statusCode).toBe(201);
        await waitStage('awaiting_action_review');
        await snapshot('M1 reached pending human action review');
        console.log('LIVE_M1_REACHED_ACTION_REVIEW');
      }catch(error){await snapshot(error instanceof Error?error.message:String(error));throw error;}
      finally {await environment!.client.workflow.getHandle('mission:'+auth.tenantId+':'+mission.id).cancel().catch(()=>{});}
    });}finally{await nest.close();}
  },1900000);
});
