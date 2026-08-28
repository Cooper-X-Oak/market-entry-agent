import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { CreateMissionRequest, UpdateMissionRequest } from '@imea/contracts';
import { DomainError } from '@imea/domain';
import type { Database } from './client.js';
import { actionCards, approvals, artifacts, artifactVersions, claims, contactPoints, entities, entityRelationships, interactions, marketRoutes, missionDashboardReadModel, missionEntities, missionProgressReadModel, missions, opportunities, opportunityScores, runReadModel, stakeholderRoles, timelineReadModel } from './schema/index.js';
import { TransactionManager, type DatabaseTransaction } from './transaction.js';

export class MissionRepository {
  private readonly transactions: TransactionManager;
  constructor(db: Database) { this.transactions = new TransactionManager(db); }

  async findById(tenantId: string, missionId: string) {
    const [mission] = await this.transactions.run(tenantId, (tx) => tx.select().from(missions).where(and(eq(missions.tenantId, tenantId), eq(missions.id, missionId))).limit(1));
    return mission ?? null;
  }

  async list(tenantId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [rows, countRows] = await this.transactions.run(tenantId, (tx) => Promise.all([
      tx.select().from(missions).where(eq(missions.tenantId, tenantId)).orderBy(desc(missions.updatedAt)).limit(pageSize).offset(offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(missions).where(eq(missions.tenantId, tenantId)),
    ]));
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  async create(transaction: DatabaseTransaction, tenantId: string, createdBy: string, input: CreateMissionRequest) {
    const [mission] = await transaction.insert(missions).values({
      tenantId,
      createdBy,
      name: input.name,
      companyName: input.companyName,
      companyWebsite: input.companyWebsite,
      productScope: input.productScope,
      targetCountries: input.targetCountries,
      targetIndustries: input.targetIndustries,
      targetProfiles: input.targetProfiles,
      objective: input.objective,
      successDefinition: input.successDefinition,
      outputLanguages: input.outputLanguages,
      budgetConfig: input.budgetConfig,
    }).returning();
    if (!mission) throw new Error('Mission insert returned no row');
    return mission;
  }

  async update(transaction: DatabaseTransaction, tenantId: string, missionId: string, input: UpdateMissionRequest) {
    const [mission] = await transaction.update(missions).set({ ...input, updatedAt: new Date() }).where(and(eq(missions.tenantId, tenantId), eq(missions.id, missionId))).returning();
    if (!mission) throw new DomainError({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });
    return mission;
  }

  async setStage(transaction: DatabaseTransaction, tenantId: string, missionId: string, currentStage: typeof missions.$inferInsert.currentStage, status?: typeof missions.$inferInsert.status) {
    const [mission] = await transaction.update(missions).set({ currentStage, ...(status ? { status } : {}), updatedAt: new Date() }).where(and(eq(missions.tenantId, tenantId), eq(missions.id, missionId))).returning();
    if (!mission) throw new DomainError({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });
    return mission;
  }
}

export class ArtifactRepository {
  async writeProposal(transaction: DatabaseTransaction, input: { tenantId: string; missionId: string; opportunityId?: string; artifactType: typeof artifacts.$inferInsert.artifactType; title: string; payload: unknown; summary: string; agentRunId?: string; createdByUserId?: string }) {
    const [existing] = await transaction.select().from(artifacts).where(and(eq(artifacts.missionId, input.missionId), eq(artifacts.artifactType, input.artifactType), input.opportunityId ? eq(artifacts.opportunityId, input.opportunityId) : sql`${artifacts.opportunityId} is null`)).limit(1);
    let artifactId = existing?.id;
    if (!artifactId) {
      const [created] = await transaction.insert(artifacts).values({ tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, artifactType: input.artifactType, title: input.title }).returning({ id: artifacts.id });
      artifactId = created?.id;
    }
    if (!artifactId) throw new Error('Artifact insert returned no row');
    const [lastVersion] = await transaction.select({ versionNo: artifactVersions.versionNo }).from(artifactVersions).where(eq(artifactVersions.artifactId, artifactId)).orderBy(desc(artifactVersions.versionNo)).limit(1);
    const [version] = await transaction.insert(artifactVersions).values({ artifactId, versionNo: (lastVersion?.versionNo ?? 0) + 1, payload: input.payload, summary: input.summary, agentRunId: input.agentRunId, createdByUserId: input.createdByUserId }).returning();
    if (!version) throw new Error('Artifact version insert returned no row');
    return version;
  }

  async accept(transaction: DatabaseTransaction, artifactVersionId: string, userId: string) {
    const [target] = await transaction.select().from(artifactVersions).where(eq(artifactVersions.id, artifactVersionId)).limit(1);
    if (!target) throw new DomainError({ code: 'ARTIFACT_VERSION_CONFLICT', message: 'Artifact version not found' });
    await transaction.update(artifactVersions).set({ status: 'superseded' }).where(and(eq(artifactVersions.artifactId, target.artifactId), eq(artifactVersions.status, 'accepted')));
    const [accepted] = await transaction.update(artifactVersions).set({ status: 'accepted', acceptedByUserId: userId, acceptedAt: new Date() }).where(eq(artifactVersions.id, artifactVersionId)).returning();
    await transaction.update(artifacts).set({ currentVersionId: artifactVersionId, updatedAt: new Date() }).where(eq(artifacts.id, target.artifactId));
    return accepted;
  }
}

export class MissionQueryRepository {
  private readonly transactions: TransactionManager;
  constructor(db: Database) { this.transactions = new TransactionManager(db); }

  private read<T>(tenantId: string, work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> { return this.transactions.run(tenantId, work); }

  async capabilities(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(claims).where(and(eq(claims.tenantId, tenantId), eq(claims.missionId, missionId))).orderBy(desc(claims.updatedAt))); }
  async routes(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, tenantId), eq(marketRoutes.missionId, missionId))).orderBy(asc(marketRoutes.rank))); }
  async entities(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select({ entity: entities, mission: missionEntities }).from(missionEntities).innerJoin(entities, eq(entities.id, missionEntities.entityId)).where(and(eq(entities.tenantId, tenantId), eq(missionEntities.missionId, missionId))).orderBy(desc(missionEntities.relevanceScore))); }
  async relationships(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(entityRelationships).where(and(eq(entityRelationships.tenantId, tenantId), eq(entityRelationships.missionId, missionId)))); }
  async stakeholders(tenantId: string, missionId: string, organizationId?: string) { return this.read(tenantId, (tx) => tx.select().from(stakeholderRoles).where(and(eq(stakeholderRoles.tenantId, tenantId), eq(stakeholderRoles.missionId, missionId), ...(organizationId ? [eq(stakeholderRoles.organizationId, organizationId)] : [])))); }
  async contacts(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, tenantId), eq(contactPoints.missionId, missionId))).orderBy(asc(contactPoints.preferredRank))); }
  async opportunities(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(opportunities).where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.missionId, missionId))).orderBy(desc(opportunities.score))); }
  async opportunity(tenantId: string, missionId: string, opportunityId: string) { const [row] = await this.read(tenantId, (tx) => tx.select().from(opportunities).where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.missionId, missionId), eq(opportunities.id, opportunityId))).limit(1)); return row ?? null; }
  async scores(tenantId: string, missionId: string, opportunityId: string) { return this.read(tenantId, (tx) => tx.select({ score: opportunityScores }).from(opportunityScores).innerJoin(opportunities, eq(opportunities.id, opportunityScores.opportunityId)).where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.missionId, missionId), eq(opportunityScores.opportunityId, opportunityId))).orderBy(desc(opportunityScores.versionNo))).then((rows) => rows.map((row) => row.score)); }
  async actionCards(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select({ actionCard: actionCards, opportunity: opportunities }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(and(eq(actionCards.tenantId, tenantId), eq(opportunities.missionId, missionId))).orderBy(desc(actionCards.updatedAt))); }
  async interactions(tenantId: string, missionId: string, opportunityId?: string) { return this.read(tenantId, (tx) => tx.select().from(interactions).where(and(eq(interactions.tenantId, tenantId), eq(interactions.missionId, missionId), ...(opportunityId ? [eq(interactions.opportunityId, opportunityId)] : []))).orderBy(desc(interactions.occurredAt))); }
  async timeline(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(timelineReadModel).where(and(eq(timelineReadModel.tenantId, tenantId), eq(timelineReadModel.missionId, missionId))).orderBy(desc(timelineReadModel.occurredAt))); }
  async runs(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(runReadModel).where(and(eq(runReadModel.tenantId, tenantId), eq(runReadModel.missionId, missionId))).orderBy(desc(runReadModel.startedAt))); }
  async dashboard(tenantId: string) { return this.read(tenantId, (tx) => tx.select().from(missionDashboardReadModel).where(eq(missionDashboardReadModel.tenantId, tenantId)).orderBy(desc(missionDashboardReadModel.updatedAt))); }
  async progress(tenantId: string, missionId: string) { const [row] = await this.read(tenantId, (tx) => tx.select().from(missionProgressReadModel).where(and(eq(missionProgressReadModel.tenantId, tenantId), eq(missionProgressReadModel.missionId, missionId))).limit(1)); return row ?? null; }
  async pendingApprovals(tenantId: string, missionId: string) { return this.read(tenantId, (tx) => tx.select().from(approvals).where(and(eq(approvals.tenantId, tenantId), eq(approvals.missionId, missionId), eq(approvals.status, 'pending')))); }
}
