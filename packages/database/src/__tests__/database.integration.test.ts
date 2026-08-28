import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, type DatabaseClient } from '../client.js';
import { DomainEventWriter } from '../events.js';
import { ArtifactRepository, MissionRepository } from '../repositories.js';
import { domainEvents, missions, outboxEvents, projectionCheckpoints, tenants, users } from '../schema/index.js';
import { TransactionManager } from '../transaction.js';

const tenantA = '20000000-0000-4000-8000-000000000001';
const tenantB = '20000000-0000-4000-8000-000000000002';
const userId = '20000000-0000-4000-8000-000000000003';
const migrations = ['0000_initial.sql', '0001_rls.sql', '0002_service_roles_and_rls.sql', '0003_contact_evidence_chain.sql', '0004_domain_event_projection.sql', '0005_interaction_feedback.sql'];

describe('database integration', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const admin = postgres(container.getConnectionUri(), { max: 1 });
    for (const migration of migrations) await admin.unsafe(await readFile(fileURLToPath(new URL(`../../migrations/${migration}`, import.meta.url)), 'utf8'));
    await admin.unsafe("ALTER ROLE imea_api LOGIN PASSWORD 'api-pass'");
    await admin.unsafe("ALTER ROLE imea_worker LOGIN PASSWORD 'worker-pass'");
    await admin.unsafe("ALTER ROLE imea_projector LOGIN PASSWORD 'projector-pass'");
    await admin.end();
    client = createDatabaseClient(container.getConnectionUri(), 2);
    await client.db.insert(tenants).values([{ id: tenantA, name: 'Tenant A', slug: 'tenant-a' }, { id: tenantB, name: 'Tenant B', slug: 'tenant-b' }]);
    await client.db.insert(users).values({ id: userId, email: 'integration@example.test', displayName: 'Integration User', passwordHash: 'test-only' });
  });
  afterAll(async () => {
    if (client) await client.close();
    if (container) await container.stop();
  });

  it('applies repository tenant filters', async () => {
    await client.db.insert(missions).values([{ tenantId: tenantA, name: 'A mission', companyName: 'A', companyWebsite: 'https://a.example', productScope: 'A', targetCountries: ['DE'], targetIndustries: ['Chemical'], targetProfiles: [{ type: 'distributor', description: 'A' }], objective: 'A', successDefinition: 'A', outputLanguages: ['en'], budgetConfig: {}, createdBy: userId }, { tenantId: tenantB, name: 'B mission', companyName: 'B', companyWebsite: 'https://b.example', productScope: 'B', targetCountries: ['MX'], targetIndustries: ['Appliance'], targetProfiles: [{ type: 'buyer', description: 'B' }], objective: 'B', successDefinition: 'B', outputLanguages: ['es'], budgetConfig: {}, createdBy: userId }]);
    const result = await new MissionRepository(client.db).list(tenantA, 1, 50);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.name).toBe('A mission');
  });

  it('writes domain event and outbox atomically', async () => {
    const eventWriter = new DomainEventWriter();
    const transactions = new TransactionManager(client.db);
    const aggregateId = crypto.randomUUID();
    const eventId = await transactions.run(tenantA, (tx) => eventWriter.append(tx, { tenantId: tenantA, aggregateType: 'mission', aggregateId, eventType: 'mission.started.v1', actorType: 'system', payload: { tenantId: tenantA, aggregateId, actor: { type: 'system' } } }));
    await transactions.run(tenantA, (tx) => eventWriter.append(tx, { tenantId: tenantA, aggregateType: 'mission', aggregateId, expectedAggregateVersion: 1, eventType: 'mission.stage_changed.v1', actorType: 'system', payload: { tenantId: tenantA, aggregateId, actor: { type: 'system' }, before: { stage: 'draft' }, after: { stage: 'compiling' } } }));
    const outbox = await client.db.select().from(outboxEvents);
    expect(outbox.some((row) => row.domainEventId === eventId)).toBe(true);
    expect(outbox.filter((row) => row.tenantId === tenantA)).toHaveLength(2);
  });

  it('rolls back both the domain event and its outbox record when the command transaction fails', async () => {
    const beforeEvents = (await client.db.select().from(domainEvents)).length;
    const beforeOutbox = (await client.db.select().from(outboxEvents)).length;
    const aggregateId = crypto.randomUUID();
    await expect(new TransactionManager(client.db).run(tenantA, async (tx) => {
      await new DomainEventWriter().append(tx, { tenantId: tenantA, aggregateType: 'mission', aggregateId, eventType: 'mission.failed.v1', actorType: 'system', payload: { tenantId: tenantA, aggregateId, actor: { type: 'system' } } });
      throw new Error('fixture rollback');
    })).rejects.toThrow('fixture rollback');
    expect((await client.db.select().from(domainEvents))).toHaveLength(beforeEvents);
    expect((await client.db.select().from(outboxEvents))).toHaveLength(beforeOutbox);
  });

  it('enforces API tenant RLS and blocks worker cross-tenant updates', async () => {
    const scoped = postgres({ host: container.getHost(), port: container.getPort(), database: container.getDatabase(), username: 'imea_api', password: 'api-pass', max: 1 });
    const withoutContext = await scoped`select id from missions`;
    expect(withoutContext).toHaveLength(0);
    const visible = await scoped.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantA}, true)`;
      return transaction`select tenant_id from missions`;
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.tenant_id).toBe(tenantA);
    await scoped.end();

    const worker = postgres({ host: container.getHost(), port: container.getPort(), database: container.getDatabase(), username: 'imea_worker', password: 'worker-pass', max: 1 });
    const [tenantBMission] = await client.db.select().from(missions).where(eq(missions.tenantId, tenantB)).limit(1);
    const changed = await worker.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantA}, true)`;
      return transaction`update missions set name = 'forbidden update' where id = ${tenantBMission!.id} returning id`;
    });
    expect(changed).toHaveLength(0);
    await worker.end();
  });

  it('leases each outbox event to only one projector and checkpoints retries idempotently', async () => {
    const connection = () => postgres({ host: container.getHost(), port: container.getPort(), database: container.getDatabase(), username: 'imea_projector', password: 'projector-pass', max: 1 });
    const first = connection();
    const second = connection();
    const [firstBatch, secondBatch] = await Promise.all([first`select * from claim_outbox_batch('projector-a', 1, 30)`, second`select * from claim_outbox_batch('projector-b', 1, 30)`]);
    expect(firstBatch).toHaveLength(1);
    expect(secondBatch).toHaveLength(1);
    expect(firstBatch[0]?.outbox_id).not.toBe(secondBatch[0]?.outbox_id);
    const eventId = firstBatch[0]?.domain_event_id as string;
    await first`insert into projection_checkpoints (consumer_name, last_event_id, processed_count) values ('mission-read-model', ${eventId}, 1) on conflict (consumer_name) do update set last_event_id = excluded.last_event_id, processed_count = projection_checkpoints.processed_count`;
    await first`insert into projection_checkpoints (consumer_name, last_event_id, processed_count) values ('mission-read-model', ${eventId}, 1) on conflict (consumer_name) do update set last_event_id = excluded.last_event_id, processed_count = projection_checkpoints.processed_count`;
    const checkpoints = await client.db.select().from(projectionCheckpoints);
    expect(checkpoints.filter((row) => row.consumerName === 'mission-read-model')).toHaveLength(1);
    expect(checkpoints.find((row) => row.consumerName === 'mission-read-model')?.processedCount).toBe(1);
    await first.end();
    await second.end();
  });

  it('switches accepted artifact versions in one tenant-scoped transaction', async () => {
    const [mission] = await client.db.select().from(missions).where(eq(missions.tenantId, tenantA)).limit(1);
    expect(mission).toBeDefined();
    const repository = new ArtifactRepository();
    const manager = new TransactionManager(client.db);
    const first = await manager.run(tenantA, (tx) => repository.writeProposal(tx, { tenantId: tenantA, missionId: mission!.id, artifactType: 'mission_brief', title: 'Brief', payload: { version: 1 }, summary: 'v1' }));
    const second = await manager.run(tenantA, (tx) => repository.writeProposal(tx, { tenantId: tenantA, missionId: mission!.id, artifactType: 'mission_brief', title: 'Brief', payload: { version: 2 }, summary: 'v2' }));
    await manager.run(tenantA, (tx) => repository.accept(tx, first.id, userId));
    const accepted = await manager.run(tenantA, (tx) => repository.accept(tx, second.id, userId));
    expect(accepted?.status).toBe('accepted');
  });
});
