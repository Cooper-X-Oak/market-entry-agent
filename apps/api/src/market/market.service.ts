import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CreateMissionRequest, UpdateMissionRequest } from '@imea/contracts';
import { getEnvironment } from '@imea/config';
import { BrowserConnector, DocumentConnector, type ObjectStorageConnector } from '@imea/connectors';
import {
  actionCardEvidenceLinks,
  actionCards,
  approvals,
  artifacts,
  artifactVersions,
  claims,
  claimEvidenceLinks,
  contactPoints,
  contactPointEvidenceLinks,
  contactVerifications,
  domainEvents,
  DomainEventWriter,
  entities,
  interactions,
  marketRoutes,
  missionEntities,
  MissionQueryRepository,
  MissionRepository,
  missions,
  missionSources,
  opportunities,
  opportunityContacts,
  opportunityStakeholders,
  evidenceItems,
  sourceSnapshots,
  sources,
  stakeholderRoles,
  routeEvidenceLinks,
  targetAssessmentEvidenceLinks,
  targetAssessments,
  users,
  workflowInstances,
  type Database,
  type DatabaseTransaction,
  type TransactionManager,
} from '@imea/database';
import { actionCardTransitions, assertTransition, contactTransitions, DomainError, missionStageTransitions, opportunityTransitions } from '@imea/domain';
import { requirePermission } from '@imea/policies';
import type { TemporalGateway } from '@imea/workflows';
import { from, switchMap, type Observable } from 'rxjs';
import type { AuthContext } from '../common/auth-context.js';
import { EventStreamService } from '../common/event-stream.service.js';
import { DATABASE, OBJECT_STORAGE, TEMPORAL_GATEWAY, TRANSACTION_MANAGER } from '../tokens.js';

interface EventOptions {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  missionId?: string;
  opportunityId?: string;
  before?: unknown;
}

@Injectable()
export class MarketService {
  private readonly missionRepository: MissionRepository;
  private readonly queries: MissionQueryRepository;
  private readonly eventWriter = new DomainEventWriter();
  private readonly executionMode = getEnvironment().MOCK_CONNECTORS || getEnvironment().MOCK_MODEL_PROVIDER ? 'fixture' as const : 'live' as const;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TRANSACTION_MANAGER) private readonly transactions: TransactionManager,
    @Inject(TEMPORAL_GATEWAY) private readonly temporal: TemporalGateway,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageConnector,
    private readonly eventStream: EventStreamService,
  ) {
    this.missionRepository = new MissionRepository(db);
    this.queries = new MissionQueryRepository(db);
  }

  private async mutate<T>(auth: AuthContext, options: EventOptions, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const correlationId = randomUUID();
    return this.transactions.run({ tenantId: auth.tenantId, actor: { type: 'user', id: auth.userId }, correlationId }, async (tx) => {
      const value = await work(tx);
      await this.eventWriter.append(tx, {
        tenantId: auth.tenantId,
        aggregateType: options.aggregateType,
        aggregateId: options.aggregateId,
        eventType: options.eventType,
        actorType: 'user',
        actorId: auth.userId,
        correlationId,
        payload: { tenantId: auth.tenantId, ...(options.missionId ? { missionId: options.missionId } : {}), ...(options.opportunityId ? { opportunityId: options.opportunityId } : {}), aggregateId: options.aggregateId, actor: { type: 'user', id: auth.userId }, ...(options.before !== undefined ? { before: options.before } : {}), after: value },
      });
      return value;
    });
  }

  private read<T>(auth: AuthContext, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.transactions.run({ tenantId: auth.tenantId, actor: { type: 'user', id: auth.userId }, correlationId: randomUUID() }, work);
  }

  private commandReceipt(input: { commandId: string; correlationId: string; aggregateId: string; workflowId: string; missionId?: string; interactionId?: string }) {
    return { ...input, acceptedAt: new Date().toISOString() };
  }

  async createMission(auth: AuthContext, input: CreateMissionRequest) {
    requirePermission(auth.role, 'mission:write');
    const id = crypto.randomUUID();
    return this.mutate(auth, { aggregateType: 'mission', aggregateId: id, eventType: 'mission.created.v1', missionId: id }, async (tx) => {
      const [mission] = await tx.insert(missions).values({ id, tenantId: auth.tenantId, createdBy: auth.userId, name: input.name, companyName: input.companyName, companyWebsite: input.companyWebsite, researchDefinition: input.researchDefinition, productScope: input.productScope, targetCountries: input.targetCountries, targetIndustries: input.targetIndustries, targetProfiles: input.targetProfiles, objective: input.objective, successDefinition: input.successDefinition, outputLanguages: input.outputLanguages, budgetConfig: input.budgetConfig, executionMode: this.executionMode }).returning();
      if (!mission) throw new Error('Mission insert returned no row');
      return mission;
    });
  }

  listMissions(auth: AuthContext, page: number, pageSize: number) { requirePermission(auth.role, 'mission:read'); return this.missionRepository.list(auth.tenantId, page, pageSize); }

  async mission(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:read');
    const mission = await this.missionRepository.findById(auth.tenantId, missionId);
    if (!mission) throw new DomainError({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });
    return mission;
  }

  async updateMission(auth: AuthContext, missionId: string, input: UpdateMissionRequest) {
    requirePermission(auth.role, 'mission:write');
    const before = await this.mission(auth, missionId);
    if (before.status !== 'draft' && (input.companyWebsite !== undefined || input.companyName !== undefined || input.researchDefinition !== undefined || input.productScope !== undefined || input.targetCountries !== undefined || input.targetProfiles !== undefined || input.targetIndustries !== undefined || input.objective !== undefined || input.successDefinition !== undefined)) throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Core mission identity can only be changed while draft' });
    const updated = await this.mutate(auth, { aggregateType: 'mission', aggregateId: missionId, eventType: 'mission.updated.v1', missionId, before }, async (tx) => {
      const mission = await this.missionRepository.update(tx, auth.tenantId, missionId, input);
      if (input.budgetConfig && before.currentStage === 'awaiting_budget_review') return (await tx.update(missions).set({ currentStage: 'active', status: 'running', updatedAt: new Date() }).where(and(eq(missions.tenantId, auth.tenantId), eq(missions.id, missionId))).returning())[0] ?? mission;
      return mission;
    });
    if (input.budgetConfig && before.workflowId) await this.temporal.signalMission(auth.tenantId, missionId, 'budgetUpdated', { budget: input.budgetConfig, updatedByUserId: auth.userId });
    return updated;
  }

  async startMission(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:write');
    return this.mutate(auth, { aggregateType: 'mission', aggregateId: missionId, eventType: 'mission.started.v1', missionId }, async (tx) => {
      await tx.execute(sql`select id from missions where id=${missionId} and tenant_id=${auth.tenantId} for update`);
      const [current] = await tx.select().from(missions).where(and(eq(missions.id, missionId), eq(missions.tenantId, auth.tenantId)));
      if (!current) throw new DomainError({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });
      assertTransition('mission', missionStageTransitions, current.currentStage, 'compiling');
      const workflowId = await this.temporal.startMission(auth.tenantId, missionId);
      const execution = await this.temporal.describeMission(auth.tenantId, missionId);
      await tx.insert(workflowInstances).values({ tenantId: auth.tenantId, missionId, workflowType: 'mission', workflowId, runId: execution.runId, status: 'running' }).onConflictDoUpdate({ target: workflowInstances.workflowId, set: { runId: execution.runId, status: 'running', closedAt: null, updatedAt: new Date() } });
      const [updated] = await tx.update(missions).set({ status: 'running', currentStage: 'compiling', workflowId, updatedAt: new Date() }).where(and(eq(missions.tenantId, auth.tenantId), eq(missions.id, missionId))).returning();
      return updated;
    });
  }

  async pauseMission(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:write');
    const current = await this.mission(auth, missionId);
    if (!current.workflowId || current.status !== 'running') throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Only a running Mission with an active Workflow can be paused' });
    await this.temporal.signalMission(auth.tenantId, missionId, 'missionPauseRequested', { requestedByUserId: auth.userId });
    return this.mutate(auth, { aggregateType: 'mission', aggregateId: missionId, eventType: 'mission.paused.v1', missionId, before: current }, async (tx) => (await tx.update(missions).set({ status: 'paused', updatedAt: new Date() }).where(and(eq(missions.tenantId, auth.tenantId), eq(missions.id, missionId))).returning())[0]);
  }

  async resumeMission(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:write');
    const current = await this.mission(auth, missionId);
    if (!current.workflowId || current.status !== 'paused') throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Only a paused Mission with an active Workflow can be resumed' });
    await this.temporal.signalMission(auth.tenantId, missionId, 'missionResumeRequested', { requestedByUserId: auth.userId });
    return this.mutate(auth, { aggregateType: 'mission', aggregateId: missionId, eventType: 'mission.resumed.v1', missionId, before: current }, async (tx) => (await tx.update(missions).set({ status: 'running', updatedAt: new Date() }).where(and(eq(missions.tenantId, auth.tenantId), eq(missions.id, missionId))).returning())[0]);
  }

  async refreshMission(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:write'); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'manualRefreshRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId }; }

  async completeMission(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:write');
    const current = await this.mission(auth, missionId);
    if (current.status === 'completed') return current;
    if (!current.workflowId || !['running', 'paused'].includes(current.status)) throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Only a started Mission can be completed' });
    const [approvedCards] = await this.read(auth, (tx) => tx.select({ count: sql<number>`count(*)::int` }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(and(eq(opportunities.missionId, missionId), inArray(actionCards.status, ['approved', 'exported', 'executed', 'completed']))));
    if ((approvedCards?.count ?? 0) < 1) throw new DomainError({ code: 'MISSION_COMPLETION_GATE_FAILED', message: 'Approve at least one Action Card before completing the Mission' });
    const commandId = randomUUID(); const correlationId = randomUUID();
    await this.temporal.signalMission(auth.tenantId, missionId, 'missionCompletionRequested', { requestedByUserId: auth.userId });
    return this.commandReceipt({ commandId, correlationId, aggregateId: missionId, missionId, workflowId: current.workflowId });
  }

  async progress(auth: AuthContext, missionId: string) { return this.missionWorkflowProgress(auth, missionId); }
  async missionWorkflowProgress(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:read');
    await this.mission(auth, missionId);
    const projected = await this.queries.progress(auth.tenantId, missionId);
    if (projected) return projected;
    try { const state = await this.temporal.queryMission<Record<string, unknown>>(auth.tenantId, missionId, 'getMissionProgress'); return { ...state, readModelVersion: 0, lastEventId: null }; } catch { return null; }
  }
  async opportunityWorkflowProgress(auth: AuthContext, missionId: string, opportunityId: string) {
    const opportunity = await this.queries.opportunity(auth.tenantId, missionId, opportunityId);
    if (!opportunity) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' });
    const [lastEvent] = await this.read(auth, (tx) => tx.select({ id: domainEvents.id, aggregateVersion: domainEvents.aggregateVersion }).from(domainEvents).where(and(eq(domainEvents.tenantId, auth.tenantId), eq(domainEvents.aggregateType, 'opportunity'), eq(domainEvents.aggregateId, opportunityId))).orderBy(desc(domainEvents.aggregateVersion)).limit(1));
    try { const state = await this.temporal.queryOpportunity<Record<string, unknown>>(auth.tenantId, opportunityId, 'getOpportunityProgress'); return { ...state, readModelVersion: lastEvent?.aggregateVersion ?? 0, lastEventId: lastEvent?.id ?? null }; } catch { return { status: opportunity.status, pendingUnknowns: [], readModelVersion: lastEvent?.aggregateVersion ?? 0, lastEventId: lastEvent?.id ?? null }; }
  }

  async metrics(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:read');
    await this.mission(auth, missionId);
    const [routeCount, targetCount, contactCount, actionCount, opportunityCount] = await this.read(auth, (tx) => Promise.all([
      tx.select({ count: sql<number>`count(*)::int` }).from(marketRoutes).where(and(eq(marketRoutes.missionId, missionId), eq(marketRoutes.status, 'approved'))),
      tx.select({ count: sql<number>`count(*)::int` }).from(missionEntities).where(eq(missionEntities.missionId, missionId)),
      tx.select({ count: sql<number>`count(*)::int` }).from(contactPoints).where(and(eq(contactPoints.missionId, missionId), inArray(contactPoints.verificationStatus, ['source_confirmed', 'cross_confirmed', 'manually_confirmed']))),
      tx.select({ count: sql<number>`count(*)::int` }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(eq(opportunities.missionId, missionId)),
      tx.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(eq(opportunities.missionId, missionId)),
    ]));
    return { approvedRoutes: routeCount[0]?.count ?? 0, targets: targetCount[0]?.count ?? 0, verifiedContacts: contactCount[0]?.count ?? 0, actionCards: actionCount[0]?.count ?? 0, opportunities: opportunityCount[0]?.count ?? 0 };
  }

  async cockpit(auth: AuthContext, missionId: string) {
    const mission = await this.mission(auth, missionId);
    const [progress, metrics, sourceRows, targetRows, cardRows] = await Promise.all([
      this.missionWorkflowProgress(auth, missionId),
      this.metrics(auth, missionId),
      this.listSources(auth, missionId),
      this.targets(auth, missionId),
      this.actionCards(auth, missionId),
    ]);
    const decisionByStage: Record<string, { type: string; title: string; instruction: string; path: string }> = {
      awaiting_capability_review: { type: 'capability_review', title: '确认企业能力边界', instruction: '处理全部高影响能力声明，并确认至少一项有公开证据支持的能力。', path: `/missions/${missionId}/capability-ledger` },
      awaiting_route_review: { type: 'route_review', title: '批准市场进入路线', instruction: '比较路线证据、难度与资源投入，批准至少一条路线。', path: `/missions/${missionId}/market-routes` },
      awaiting_target_review: { type: 'target_review', title: '选择优先目标', instruction: '从 Top 10 目标中选择 1–3 个进入机会研究。', path: `/missions/${missionId}/targets` },
      awaiting_action_review: { type: 'action_review', title: '批准首张行动卡', instruction: '核对目标、证据、已知信息与下一步动作，批准至少一张 Action Card。', path: `/missions/${missionId}/action-queue` },
    };
    const approvedActionCardCount = cardRows.filter((row) => ['approved', 'exported', 'executed', 'completed'].includes(row.actionCard.status)).length;
    return {
      mission,
      executionMode: mission.executionMode,
      progress,
      currentDecision: decisionByStage[mission.currentStage] ?? null,
      counts: { sources: sourceRows.length, candidateTargets: targetRows.length, selectedTargets: targetRows.filter((row) => row.mission.targetStatus === 'high_priority').length, approvedActionCards: approvedActionCardCount, ...metrics },
      businessChain: [
        { key: 'mission', label: 'Mission', ready: mission.status !== 'draft' },
        { key: 'evidence', label: 'Evidence', ready: sourceRows.length > 0 },
        { key: 'route', label: 'Route', ready: metrics.approvedRoutes > 0 },
        { key: 'target', label: 'Target', ready: targetRows.some((row) => row.mission.targetStatus === 'high_priority') },
        { key: 'contact', label: 'Contact', ready: metrics.verifiedContacts > 0, optional: true },
        { key: 'opportunity', label: 'Opportunity', ready: metrics.opportunities > 0 },
        { key: 'action_card', label: 'Action Card', ready: approvedActionCardCount > 0 },
      ],
    };
  }

  stream(auth: AuthContext, missionId: string, lastEventId?: string): Observable<MessageEvent> {
    requirePermission(auth.role, 'mission:read');
    return from(this.mission(auth, missionId)).pipe(switchMap(() => this.eventStream.stream(missionId, lastEventId)));
  }

  async addSourceUrl(auth: AuthContext, missionId: string, input: { url: string; sourceKind?: 'website' | 'manual_url' }) {
    requirePermission(auth.role, 'mission:write');
    await this.mission(auth, missionId);
    const normalizedUrl = new URL(input.url).toString();
    if (!['http:', 'https:'].includes(new URL(normalizedUrl).protocol)) throw new DomainError({ code: 'SOURCE_URL_INVALID', message: 'Source URL must use HTTP or HTTPS' });
    const connector = new BrowserConnector(this.storage);
    const result = await connector.execute({ tenantId: auth.tenantId, missionId, operation: 'fetch_page', url: normalizedUrl });
    const item = result.items[0];
    const extractedText = item?.content ?? '';
    const suppliedHash = item?.metadata.contentHash;
    const contentHash = typeof suppliedHash === 'string' ? suppliedHash : createHash('sha256').update(extractedText).digest('hex');
    const stored = result.rawObjectKey ? { objectKey: result.rawObjectKey, contentHash } : await this.storage.put(auth.tenantId, missionId, 'web', extractedText, 'text/plain');
    const candidateSourceId = randomUUID();
    const [existing] = await this.read(auth, (tx) => tx.select({ id: sources.id }).from(sources).where(and(eq(sources.tenantId, auth.tenantId), eq(sources.missionId, missionId), eq(sources.normalizedUrl, normalizedUrl))).limit(1));
    const sourceId = existing?.id ?? candidateSourceId;
    return this.mutate(auth, { aggregateType: 'source', aggregateId: sourceId, eventType: 'source.added.v1', missionId }, async (tx) => {
      await tx.insert(missionSources).values({ tenantId: auth.tenantId, missionId, sourceKind: input.sourceKind ?? 'manual_url', url: normalizedUrl, uploadedBy: auth.userId });
      const [source] = await tx.insert(sources).values({ id: sourceId, tenantId: auth.tenantId, missionId, sourceType: input.sourceKind === 'website' ? 'company_website' : 'search_result', url: normalizedUrl, normalizedUrl, title: item?.title, metadata: { connector: connector.type }, status: 'active' }).onConflictDoUpdate({ target: [sources.tenantId, sources.missionId, sources.normalizedUrl], set: { title: item?.title, lastFetchedAt: new Date(), status: 'active' } }).returning();
      if (!source) throw new Error('URL Source insert returned no row');
      const [inserted] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, httpStatus: Number(item?.metadata.httpStatus ?? 200), contentHash: stored.contentHash, objectKey: stored.objectKey, extractedText, extractionMetadata: { connector: connector.type } }).onConflictDoNothing().returning();
      const snapshot = inserted ?? (await tx.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.sourceId, source.id), eq(sourceSnapshots.contentHash, stored.contentHash))).limit(1))[0];
      if (!snapshot) throw new Error('URL Source Snapshot insert returned no row');
      const [updated] = await tx.update(sources).set({ latestSnapshotId: snapshot.id, lastFetchedAt: new Date() }).where(eq(sources.id, source.id)).returning();
      return { ...updated, snapshotId: snapshot.id, contentHash: snapshot.contentHash };
    });
  }

  async uploadSource(auth: AuthContext, missionId: string, file: { filename: string; mimetype: string; bytes: Uint8Array }) {
    requirePermission(auth.role, 'mission:write');
    await this.mission(auth, missionId);
    if (file.bytes.byteLength > 50 * 1024 * 1024) throw new DomainError({ code: 'SOURCE_UPLOAD_INVALID', message: 'Maximum upload size is 50 MB' });
    const extension = file.filename.split('.').pop()?.toLowerCase();
    const operationByExtension: Record<string, string> = { pdf: 'parse_pdf', docx: 'parse_docx', xlsx: 'parse_xlsx', pptx: 'parse_pptx' };
    const operation = extension ? operationByExtension[extension] : undefined;
    if (!operation) throw new DomainError({ code: 'SOURCE_UPLOAD_INVALID', message: 'Supported upload types are PDF, DOCX, XLSX and PPTX' });
    const stored = await this.storage.put(auth.tenantId, missionId, 'uploads', file.bytes, file.mimetype);
    const parsed = await new DocumentConnector(this.storage).execute({ tenantId: auth.tenantId, missionId, operation, options: { objectKey: stored.objectKey } });
    const extractedText = parsed.items.map((item) => item.content ?? '').join('\n\n');
    const id = crypto.randomUUID();
    return this.mutate(auth, { aggregateType: 'source', aggregateId: id, eventType: 'source.added.v1', missionId }, async (tx) => {
      await tx.insert(missionSources).values({ id, tenantId: auth.tenantId, missionId, sourceKind: 'uploaded_file', originalName: file.filename, objectKey: stored.objectKey, mimeType: file.mimetype, contentHash: stored.contentHash, uploadedBy: auth.userId });
      const [source] = await tx.insert(sources).values({ tenantId: auth.tenantId, missionId, sourceType: 'uploaded_document', title: file.filename, metadata: { mimeType: file.mimetype, missionSourceId: id }, status: 'active' }).returning();
      if (!source) throw new Error('Uploaded Source insert returned no row');
      const [snapshot] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, httpStatus: 200, contentHash: stored.contentHash, objectKey: stored.objectKey, extractedText, extractionMetadata: { operation, mimeType: file.mimetype } }).returning();
      if (snapshot) await tx.update(sources).set({ latestSnapshotId: snapshot.id }).where(eq(sources.id, source.id));
      return source;
    });
  }

  async listSources(auth: AuthContext, missionId: string) { await this.mission(auth, missionId); return this.read(auth, (tx) => tx.select().from(sources).where(and(eq(sources.tenantId, auth.tenantId), eq(sources.missionId, missionId))).orderBy(desc(sources.lastFetchedAt))); }
  async source(auth: AuthContext, missionId: string, sourceId: string) { await this.mission(auth, missionId); const [source] = await this.read(auth, (tx) => tx.select().from(sources).where(and(eq(sources.tenantId, auth.tenantId), eq(sources.missionId, missionId), eq(sources.id, sourceId))).limit(1)); if (!source) throw new DomainError({ code: 'SOURCE_NOT_FOUND', message: 'Source not found' }); return source; }
  async snapshots(auth: AuthContext, missionId: string, sourceId: string) { await this.source(auth, missionId, sourceId); return this.read(auth, (tx) => tx.select().from(sourceSnapshots).where(eq(sourceSnapshots.sourceId, sourceId)).orderBy(desc(sourceSnapshots.fetchedAt))); }

  async capabilities(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:read');
    const claimRows = await this.queries.capabilities(auth.tenantId, missionId);
    if (claimRows.length === 0) return [];
    const evidenceRows = await this.read(auth, (tx) => tx.select({ link: claimEvidenceLinks, evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(claimEvidenceLinks).innerJoin(evidenceItems, eq(evidenceItems.id, claimEvidenceLinks.evidenceItemId)).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(evidenceItems.tenantId, auth.tenantId), eq(evidenceItems.missionId, missionId), inArray(claimEvidenceLinks.claimId, claimRows.map((claim) => claim.id)))));
    return claimRows.map((claim) => ({ ...claim, evidence: evidenceRows.filter((row) => row.link.claimId === claim.id).map((row) => ({ evidenceId: row.evidence.id, stance: row.evidence.stance, excerpt: row.evidence.excerpt, locator: row.evidence.locator, sourceTitle: row.source.title, sourceUrl: row.source.url, fetchedAt: row.snapshot.fetchedAt.toISOString(), contentHash: row.snapshot.contentHash })) }));
  }
  async updateCapability(auth: AuthContext, missionId: string, claimId: string, input: Partial<typeof claims.$inferInsert>) {
    requirePermission(auth.role, 'mission:write');
    return this.mutate(auth, { aggregateType: 'claim', aggregateId: claimId, eventType: 'claim.updated.v1', missionId }, async (tx) => {
      const [claim] = await tx.update(claims).set({ ...input, updatedAt: new Date(), createdByUserId: auth.userId }).where(and(eq(claims.tenantId, auth.tenantId), eq(claims.missionId, missionId), eq(claims.id, claimId))).returning();
      if (!claim) throw new DomainError({ code: 'CLAIM_NOT_FOUND', message: 'Claim not found' });
      return claim;
    });
  }
  confirmCapability(auth: AuthContext, missionId: string, claimId: string) { return this.updateCapability(auth, missionId, claimId, { status: 'user_confirmed' }); }
  contradictCapability(auth: AuthContext, missionId: string, claimId: string) { return this.updateCapability(auth, missionId, claimId, { status: 'contradicted' }); }
  async researchCapabilities(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:write'); const mission = await this.mission(auth, missionId); if (!mission.workflowId) throw new DomainError({ code: 'MISSION_WORKFLOW_UNAVAILABLE', message: 'Start the Mission before requesting capability research' }); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'capabilityResearchRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId, scope: 'capabilities' }; }

  async completeCapabilityReview(auth: AuthContext, missionId: string, input: { resolvedClaimIds: string[]; comment?: string }) {
    requirePermission(auth.role, 'mission:write');
    const mission = await this.mission(auth, missionId);
    if (mission.currentStage !== 'awaiting_capability_review' || !mission.workflowId) throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Capability review is available while the Mission awaits capability review' });
    const highImpact = (await this.capabilities(auth, missionId)).filter((claim) => claim.impactLevel === 'high');
    const reviewed = new Set(input.resolvedClaimIds);
    if (highImpact.length === 0 || highImpact.some((claim) => !reviewed.has(claim.id) || !['user_confirmed', 'contradicted', 'unknown'].includes(claim.status)) || !highImpact.some((claim) => claim.status === 'user_confirmed' && claim.evidence.length > 0) || highImpact.some((claim) => ['user_confirmed', 'contradicted'].includes(claim.status) && claim.evidence.length === 0)) throw new DomainError({ code: 'CAPABILITY_REVIEW_GATE_FAILED', message: 'Resolve every high-impact capability and confirm at least one evidence-backed capability' });
    const commandId = randomUUID(); const correlationId = randomUUID();
    await this.temporal.signalMission(auth.tenantId, missionId, 'capabilityReviewSubmitted', { resolvedClaimIds: input.resolvedClaimIds, decidedByUserId: auth.userId, ...(input.comment ? { comment: input.comment } : {}), commandId });
    return this.commandReceipt({ commandId, correlationId, aggregateId: missionId, missionId, workflowId: mission.workflowId });
  }

  async routes(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:read');
    const routeRows = await this.queries.routes(auth.tenantId, missionId);
    if (routeRows.length === 0) return [];
    const evidenceRows = await this.read(auth, (tx) => tx.select({ link: routeEvidenceLinks, evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(routeEvidenceLinks).innerJoin(evidenceItems, eq(evidenceItems.id, routeEvidenceLinks.evidenceItemId)).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(routeEvidenceLinks.tenantId, auth.tenantId), eq(routeEvidenceLinks.missionId, missionId), inArray(routeEvidenceLinks.routeId, routeRows.map((route) => route.id)))));
    return routeRows.map((route) => ({ ...route, supportingEvidence: evidenceRows.filter((row) => row.link.routeId === route.id && row.link.stance === 'support').map((row) => ({ evidenceId: row.evidence.id, excerpt: row.evidence.excerpt, locator: row.evidence.locator, sourceTitle: row.source.title, sourceUrl: row.source.url, fetchedAt: row.snapshot.fetchedAt.toISOString(), contentHash: row.snapshot.contentHash })), counterEvidence: evidenceRows.filter((row) => row.link.routeId === route.id && row.link.stance === 'oppose').map((row) => ({ evidenceId: row.evidence.id, excerpt: row.evidence.excerpt, locator: row.evidence.locator, sourceTitle: row.source.title, sourceUrl: row.source.url, fetchedAt: row.snapshot.fetchedAt.toISOString(), contentHash: row.snapshot.contentHash })) }));
  }
  async route(auth: AuthContext, missionId: string, routeId: string) { const [route] = await this.read(auth, (tx) => tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, auth.tenantId), eq(marketRoutes.missionId, missionId), eq(marketRoutes.id, routeId))).limit(1)); if (!route) throw new DomainError({ code: 'ROUTE_NOT_FOUND', message: 'Route not found' }); return route; }
  async updateRoute(auth: AuthContext, missionId: string, routeId: string, input: Partial<typeof marketRoutes.$inferInsert>) { requirePermission(auth.role, 'mission:write'); return this.mutate(auth, { aggregateType: 'market_route', aggregateId: routeId, eventType: 'market_route.updated.v1', missionId }, async (tx) => { const [route] = await tx.update(marketRoutes).set({ ...input, updatedAt: new Date() }).where(and(eq(marketRoutes.tenantId, auth.tenantId), eq(marketRoutes.missionId, missionId), eq(marketRoutes.id, routeId))).returning(); if (!route) throw new DomainError({ code: 'ROUTE_NOT_FOUND', message: 'Route not found' }); return route; }); }
  async approveRoute(auth: AuthContext, missionId: string, routeId: string) { requirePermission(auth.role, 'route:approve'); return this.updateRoute(auth, missionId, routeId, { status: 'approved', decidedByUserId: auth.userId, decidedAt: new Date() }); }
  async deprioritizeRoute(auth: AuthContext, missionId: string, routeId: string) { requirePermission(auth.role, 'route:approve'); return this.updateRoute(auth, missionId, routeId, { status: 'deprioritized', decidedByUserId: auth.userId, decidedAt: new Date() }); }
  async researchRoute(auth: AuthContext, missionId: string, routeId: string) { await this.route(auth, missionId, routeId); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'manualRefreshRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId, routeId }; }
  async completeRouteReview(auth: AuthContext, missionId: string, input: { approvedRouteIds: string[]; acceptedArtifactVersionIds: string[]; comment?: string }) {
    requirePermission(auth.role, 'route:approve');
    const mission = await this.mission(auth, missionId);
    if (mission.currentStage !== 'awaiting_route_review' || !mission.workflowId) throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Route review is available while the Mission awaits route review' });
    const routeRows = await this.routes(auth, missionId);
    const selected = new Set(input.approvedRouteIds);
    if (selected.size === 0 || selected.size > 3 || input.approvedRouteIds.some((id) => !routeRows.some((route) => route.id === id))) throw new DomainError({ code: 'ROUTE_APPROVAL_REQUIRED', message: 'Approve 1–3 valid routes from this Mission' });
    const requiredArtifactVersionIds = [...new Set(routeRows.filter((route) => selected.has(route.id)).map((route) => route.artifactVersionId))];
    const acceptedIds = new Set(input.acceptedArtifactVersionIds);
    if (acceptedIds.size !== requiredArtifactVersionIds.length || requiredArtifactVersionIds.some((id) => !acceptedIds.has(id))) throw new DomainError({ code: 'ACCEPTED_ROUTE_ARTIFACT_REQUIRED', message: 'Every approved route must reference its accepted Artifact Version' });
    const acceptedVersions = await this.read(auth, (tx) => tx.select().from(artifactVersions).where(inArray(artifactVersions.id, requiredArtifactVersionIds)));
    if (acceptedVersions.length !== requiredArtifactVersionIds.length) throw new DomainError({ code: 'ACCEPTED_ROUTE_ARTIFACT_REQUIRED', message: 'A selected route Artifact Version was not found' });
    const selectedRoutes = routeRows.filter((route) => selected.has(route.id));
    if (selectedRoutes.some((route) => route.supportingEvidence.length < 2 || route.keyEntityTypes.length === 0 || route.keyStakeholderRoles.length === 0 || route.primaryChannels.length === 0)) throw new DomainError({ code: 'ROUTE_APPROVAL_GATE_FAILED', message: 'Every approved route requires two supporting sources plus target entity, stakeholder and channel definitions' });
    const commandId = randomUUID(); const correlationId = randomUUID();
    await this.temporal.signalMission(auth.tenantId, missionId, 'routeReviewSubmitted', { approvedRouteIds: input.approvedRouteIds, acceptedArtifactVersionIds: input.acceptedArtifactVersionIds, decidedByUserId: auth.userId, ...(input.comment ? { comment: input.comment } : {}), commandId });
    return this.commandReceipt({ commandId, correlationId, aggregateId: missionId, missionId, workflowId: mission.workflowId });
  }

  entities(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.entities(auth.tenantId, missionId); }
  async entity(auth: AuthContext, missionId: string, entityId: string) {
    const [row] = await this.read(auth, (tx) => tx.select({ entity: entities, mission: missionEntities }).from(entities).leftJoin(missionEntities, and(eq(missionEntities.entityId, entities.id), eq(missionEntities.missionId, missionId))).where(and(eq(entities.tenantId, auth.tenantId), eq(entities.id, entityId))).limit(1));
    if (!row) throw new DomainError({ code: 'ENTITY_NOT_FOUND', message: 'Entity not found' });
    return row;
  }
  relationships(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.relationships(auth.tenantId, missionId); }
  async graph(auth: AuthContext, missionId: string) { const [nodes, edges] = await Promise.all([this.entities(auth, missionId), this.relationships(auth, missionId)]); return { nodes: nodes.slice(0, 200).map((row) => ({ id: row.entity.id, type: row.entity.entityType, label: row.entity.canonicalName, data: row })), edges: edges.slice(0, 400).map((edge) => ({ id: edge.id, source: edge.sourceEntityId, target: edge.targetEntityId, type: edge.relationshipType, data: edge })) }; }
  async updateTargetStatus(auth: AuthContext, missionId: string, entityId: string, targetStatus: 'observed' | 'target' | 'high_priority' | 'archived') {
    requirePermission(auth.role, 'mission:write');
    await this.entity(auth, missionId, entityId);
    return this.mutate(auth, { aggregateType: 'entity', aggregateId: entityId, eventType: targetStatus === 'archived' ? 'entity.archived.v1' : 'entity.promoted.v1', missionId }, async (tx) => {
      const [target] = await tx.update(missionEntities).set({ targetStatus, updatedAt: new Date() }).where(and(eq(missionEntities.missionId, missionId), eq(missionEntities.entityId, entityId))).returning();
      return target;
    });
  }
  promoteEntity(auth: AuthContext, missionId: string, entityId: string) { return this.updateTargetStatus(auth, missionId, entityId, 'target'); }
  archiveEntity(auth: AuthContext, missionId: string, entityId: string) { return this.updateTargetStatus(auth, missionId, entityId, 'archived'); }
  async researchEntity(auth: AuthContext, missionId: string, entityId: string) { await this.entity(auth, missionId, entityId); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'manualRefreshRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId, entityId }; }

  async targets(auth: AuthContext, missionId: string) {
    requirePermission(auth.role, 'mission:read');
    const rows = await this.read(auth, (tx) => tx.select({ entity: entities, mission: missionEntities, assessment: targetAssessments, route: marketRoutes }).from(targetAssessments).innerJoin(entities, eq(entities.id, targetAssessments.entityId)).innerJoin(missionEntities, and(eq(missionEntities.entityId, targetAssessments.entityId), eq(missionEntities.missionId, targetAssessments.missionId))).innerJoin(marketRoutes, eq(marketRoutes.id, targetAssessments.routeId)).where(and(eq(targetAssessments.tenantId, auth.tenantId), eq(targetAssessments.missionId, missionId), eq(targetAssessments.gatePassed, true), sql`${targetAssessments.rank} <= 10`)).orderBy(targetAssessments.rank));
    const evidenceRows = rows.length > 0 ? await this.read(auth, (tx) => tx.select({ link: targetAssessmentEvidenceLinks, evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(targetAssessmentEvidenceLinks).innerJoin(evidenceItems, eq(evidenceItems.id, targetAssessmentEvidenceLinks.evidenceItemId)).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(inArray(targetAssessmentEvidenceLinks.targetAssessmentId, rows.map((row) => row.assessment.id)))) : [];
    return rows.map((row) => ({ ...row, evidence: evidenceRows.filter((evidence) => evidence.link.targetAssessmentId === row.assessment.id).map((evidence) => ({ evidenceId: evidence.evidence.id, excerpt: evidence.evidence.excerpt, locator: evidence.evidence.locator, sourceTitle: evidence.source.title, sourceUrl: evidence.source.url, fetchedAt: evidence.snapshot.fetchedAt.toISOString(), contentHash: evidence.snapshot.contentHash })) }));
  }
  async completeTargetReview(auth: AuthContext, missionId: string, input: { selectedTargetIds: string[]; comment?: string }) {
    requirePermission(auth.role, 'mission:write');
    const mission = await this.mission(auth, missionId);
    if (mission.currentStage !== 'awaiting_target_review' || !mission.workflowId) throw new DomainError({ code: 'MISSION_STAGE_CONFLICT', message: 'Target review is available while the Mission awaits target review' });
    const candidateRows = await this.targets(auth, missionId);
    const selected = new Set(input.selectedTargetIds);
    if (selected.size < 1 || selected.size > 3 || input.selectedTargetIds.some((id) => !candidateRows.some((row) => row.entity.id === id))) throw new DomainError({ code: 'TARGET_SELECTION_REQUIRED', message: 'Select 1–3 targets from the current Top 10 candidate list' });
    const commandId = randomUUID(); const correlationId = randomUUID();
    await this.temporal.signalMission(auth.tenantId, missionId, 'targetReviewSubmitted', { selectedTargetIds: input.selectedTargetIds, decidedByUserId: auth.userId, ...(input.comment ? { comment: input.comment } : {}), commandId });
    return this.commandReceipt({ commandId, correlationId, aggregateId: missionId, missionId, workflowId: mission.workflowId });
  }
  async updateTarget(auth: AuthContext, missionId: string, entityId: string, input: { targetStatus?: 'observed' | 'target' | 'high_priority' | 'archived'; relevanceScore?: number; primaryRouteId?: string }) { requirePermission(auth.role, 'mission:write'); return this.mutate(auth, { aggregateType: 'entity', aggregateId: entityId, eventType: 'entity.updated.v1', missionId }, async (tx) => (await tx.update(missionEntities).set({ ...input, updatedAt: new Date() }).where(and(eq(missionEntities.missionId, missionId), eq(missionEntities.entityId, entityId))).returning())[0]); }

  async createOpportunity(auth: AuthContext, missionId: string, organizationId: string, input: { routeId?: string; title?: string; hypothesis?: string; priority?: 'low' | 'medium' | 'high' | 'critical' } = {}) {
    requirePermission(auth.role, 'mission:write');
    const target = await this.entity(auth, missionId, organizationId);
    const routeId = input.routeId ?? target.mission?.primaryRouteId;
    if (!routeId) throw new DomainError({ code: 'ROUTE_APPROVAL_REQUIRED', message: 'Target requires a primary route' });
    const id = crypto.randomUUID();
    const opportunity = await this.mutate(auth, { aggregateType: 'opportunity', aggregateId: id, eventType: 'opportunity.created.v1', missionId, opportunityId: id }, async (tx) => {
      const [row] = await tx.insert(opportunities).values({ id, tenantId: auth.tenantId, missionId, organizationId, routeId, title: input.title ?? `${target.entity.canonicalName} market-entry opportunity`, hypothesis: input.hypothesis ?? target.mission?.discoveryReason ?? 'Target matches approved market route', priority: input.priority ?? 'medium', status: 'target_identified', nextAction: 'Map stakeholders and discover public contact paths' }).returning();
      if (!row) throw new Error('Opportunity insert returned no row');
      return row;
    });
    await this.temporal.startOpportunity(auth.tenantId, missionId, opportunity.id);
    return opportunity;
  }

  async batchCreateOpportunities(auth: AuthContext, missionId: string, entityIds: string[]) {
    const results = [];
    for (const entityId of entityIds) results.push(await this.createOpportunity(auth, missionId, entityId));
    return results;
  }

  stakeholders(auth: AuthContext, missionId: string, organizationId?: string) { requirePermission(auth.role, 'mission:read'); return this.queries.stakeholders(auth.tenantId, missionId, organizationId); }
  async addStakeholder(auth: AuthContext, missionId: string, organizationId: string, input: { personId?: string; roleType: typeof stakeholderRoles.$inferInsert.roleType; title?: string; decisionInfluence: number; contactPriority: number; relevanceReason: string; confidence?: number }) {
    requirePermission(auth.role, 'mission:write');
    const id = crypto.randomUUID();
    return this.mutate(auth, { aggregateType: 'entity', aggregateId: id, eventType: 'stakeholder.discovered.v1', missionId }, async (tx) => (await tx.insert(stakeholderRoles).values({ id, tenantId: auth.tenantId, missionId, organizationId, ...input, confidence: input.confidence ?? 100, status: 'confirmed' }).returning())[0]);
  }
  async updateStakeholder(auth: AuthContext, missionId: string, stakeholderId: string, input: Partial<typeof stakeholderRoles.$inferInsert>) { requirePermission(auth.role, 'mission:write'); return this.mutate(auth, { aggregateType: 'entity', aggregateId: stakeholderId, eventType: 'stakeholder.updated.v1', missionId }, async (tx) => { const [row] = await tx.update(stakeholderRoles).set({ ...input, updatedAt: new Date() }).where(and(eq(stakeholderRoles.tenantId, auth.tenantId), eq(stakeholderRoles.missionId, missionId), eq(stakeholderRoles.id, stakeholderId))).returning(); if (!row) throw new DomainError({ code: 'STAKEHOLDER_NOT_FOUND', message: 'Stakeholder not found' }); return row; }); }
  async researchStakeholders(auth: AuthContext, missionId: string, organizationId: string) { await this.entity(auth, missionId, organizationId); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'manualRefreshRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId, organizationId, scope: 'stakeholders' }; }

  contacts(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.contacts(auth.tenantId, missionId); }
  private async contactRow(auth: AuthContext, missionId: string, contactPointId: string) { const [row] = await this.read(auth, (tx) => tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(contactPoints.id, contactPointId))).limit(1)); if (!row) throw new DomainError({ code: 'CONTACT_POINT_NOT_FOUND', message: 'Contact point not found' }); return row; }
  async contact(auth: AuthContext, missionId: string, contactPointId: string) {
    requirePermission(auth.role, 'mission:read');
    const contactPoint = await this.contactRow(auth, missionId, contactPointId);
    const [organization, person, stakeholderRole, history, sourceRows] = await this.read(auth, (tx) => Promise.all([
      tx.select().from(entities).where(and(eq(entities.tenantId, auth.tenantId), eq(entities.id, contactPoint.organizationId))).limit(1).then((rows) => rows[0]),
      contactPoint.personId ? tx.select().from(entities).where(and(eq(entities.tenantId, auth.tenantId), eq(entities.id, contactPoint.personId))).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      contactPoint.stakeholderRoleId ? tx.select().from(stakeholderRoles).where(and(eq(stakeholderRoles.tenantId, auth.tenantId), eq(stakeholderRoles.missionId, missionId), eq(stakeholderRoles.id, contactPoint.stakeholderRoleId))).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      tx.select().from(contactVerifications).where(and(eq(contactVerifications.tenantId, auth.tenantId), eq(contactVerifications.missionId, missionId), eq(contactVerifications.contactPointId, contactPointId))).orderBy(desc(contactVerifications.verifiedAt)),
      tx.select({ link: contactPointEvidenceLinks, evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(contactPointEvidenceLinks).innerJoin(evidenceItems, eq(evidenceItems.id, contactPointEvidenceLinks.evidenceItemId)).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(contactPointEvidenceLinks.tenantId, auth.tenantId), eq(contactPointEvidenceLinks.missionId, missionId), eq(contactPointEvidenceLinks.contactPointId, contactPointId))),
    ]));
    const latest = history[0];
    return { contactPoint, organization, ...(person ? { person } : {}), ...(stakeholderRole ? { stakeholderRole } : {}), verification: { currentStatus: contactPoint.verificationStatus, confidence: contactPoint.confidence, ...(contactPoint.lastVerifiedAt ? { lastVerifiedAt: contactPoint.lastVerifiedAt.toISOString() } : {}), facts: latest?.facts ?? { formatCheckPassed: false, exactValueListedByOfficialOrganization: false, independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] }, history }, sources: sourceRows.map(({ link, evidence, snapshot, source }) => ({ evidenceId: evidence.id, relationType: link.relationType, authority: link.sourceAuthority, ...(source.url ? { url: source.url } : {}), ...(source.publisher ? { publisher: source.publisher } : {}), excerpt: evidence.excerpt, locator: evidence.locator, fetchedAt: snapshot.fetchedAt.toISOString(), contentHash: snapshot.contentHash })) };
  }
  async updateContact(auth: AuthContext, missionId: string, contactPointId: string, input: Partial<typeof contactPoints.$inferInsert>) { requirePermission(auth.role, 'mission:write'); const current = await this.contactRow(auth, missionId, contactPointId); if (input.verificationStatus) assertTransition('contact', contactTransitions, current.verificationStatus, input.verificationStatus); return this.mutate(auth, { aggregateType: 'contact_point', aggregateId: contactPointId, eventType: input.verificationStatus === 'stale' ? 'contact_point.marked_stale.v1' : 'contact_point.verification_completed.v1', missionId, before: current }, async (tx) => (await tx.update(contactPoints).set({ ...input, updatedAt: new Date() }).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(contactPoints.id, contactPointId))).returning())[0]); }
  async verifyContact(auth: AuthContext, missionId: string, contactPointId: string) { requirePermission(auth.role, 'mission:write'); const current = await this.contactRow(auth, missionId, contactPointId); const score = Math.min(100, current.confidence + (current.isPublic ? 40 : 0)); const status = score >= 70 ? 'cross_confirmed' : score >= 50 ? 'source_confirmed' : score >= 30 ? 'format_valid' : 'discovered'; const facts = { formatCheckPassed: score >= 30, exactValueListedByOfficialOrganization: score >= 50, independentConfirmationGroups: score >= 70 ? ['manual-api-check'] : [], employmentConfirmationEvidenceIds: [] }; return this.mutate(auth, { aggregateType: 'contact_point', aggregateId: contactPointId, eventType: 'contact_point.verification_completed.v1', missionId, before: current }, async (tx) => { await tx.insert(contactVerifications).values({ tenantId: auth.tenantId, missionId, contactPointId, method: 'official_source', result: score >= 50 ? 'passed' : 'partial', score, details: { apiRequested: true }, verificationStatusBefore: current.verificationStatus, verificationStatusAfter: status, facts }); return (await tx.update(contactPoints).set({ verificationStatus: status, confidence: score, lastVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(contactPoints.id, contactPointId))).returning())[0]; }); }
  async confirmContact(auth: AuthContext, missionId: string, contactPointId: string) { const current = await this.contactRow(auth, missionId, contactPointId); const facts = { formatCheckPassed: true, exactValueListedByOfficialOrganization: false, independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] }; return this.mutate(auth, { aggregateType: 'contact_point', aggregateId: contactPointId, eventType: 'contact_point.manually_confirmed.v1', missionId }, async (tx) => { await tx.insert(contactVerifications).values({ tenantId: auth.tenantId, missionId, contactPointId, method: 'manual', result: 'passed', score: 100, details: {}, verificationStatusBefore: current.verificationStatus, verificationStatusAfter: 'manually_confirmed', facts, verifiedByUserId: auth.userId }); return (await tx.update(contactPoints).set({ verificationStatus: 'manually_confirmed', confidence: 100, lastVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(contactPoints.id, contactPointId))).returning())[0]; }); }
  markContactStale(auth: AuthContext, missionId: string, contactPointId: string) { return this.updateContact(auth, missionId, contactPointId, { verificationStatus: 'stale' }); }
  async researchContacts(auth: AuthContext, missionId: string, organizationId: string) { await this.entity(auth, missionId, organizationId); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'manualRefreshRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId, organizationId, scope: 'contacts' }; }

  opportunities(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.opportunities(auth.tenantId, missionId); }
  async opportunity(auth: AuthContext, missionId: string, opportunityId: string) {
    requirePermission(auth.role, 'mission:read');
    const opportunity = await this.queries.opportunity(auth.tenantId, missionId, opportunityId);
    if (!opportunity) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' });
    const [scoreHistory, stakeholders, contactLinks, cards, interactionHistory, organization, route, stateHistory, workflowProgress, claimRows] = await Promise.all([
      this.queries.scores(auth.tenantId, missionId, opportunityId),
      this.read(auth, (tx) => tx.select({ link: opportunityStakeholders, stakeholder: stakeholderRoles }).from(opportunityStakeholders).innerJoin(stakeholderRoles, eq(stakeholderRoles.id, opportunityStakeholders.stakeholderRoleId)).where(and(eq(stakeholderRoles.tenantId, auth.tenantId), eq(stakeholderRoles.missionId, missionId), eq(opportunityStakeholders.opportunityId, opportunityId)))),
      this.read(auth, (tx) => tx.select({ link: opportunityContacts, contact: contactPoints }).from(opportunityContacts).innerJoin(contactPoints, eq(contactPoints.id, opportunityContacts.contactPointId)).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(opportunityContacts.opportunityId, opportunityId)))),
      this.read(auth, (tx) => tx.select().from(actionCards).where(and(eq(actionCards.tenantId, auth.tenantId), eq(actionCards.opportunityId, opportunityId))).orderBy(desc(actionCards.versionNo))),
      this.queries.interactions(auth.tenantId, missionId, opportunityId),
      this.read(auth, (tx) => tx.select().from(entities).where(and(eq(entities.tenantId, auth.tenantId), eq(entities.id, opportunity.organizationId))).limit(1).then((rows) => rows[0])),
      this.read(auth, (tx) => tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, auth.tenantId), eq(marketRoutes.missionId, missionId), eq(marketRoutes.id, opportunity.routeId), eq(marketRoutes.status, 'approved'))).limit(1).then((rows) => rows[0])),
      this.read(auth, (tx) => tx.select().from(domainEvents).where(and(eq(domainEvents.tenantId, auth.tenantId), eq(domainEvents.aggregateType, 'opportunity'), eq(domainEvents.aggregateId, opportunityId))).orderBy(desc(domainEvents.aggregateVersion))),
      this.opportunityWorkflowProgress(auth, missionId, opportunityId),
      this.read(auth, (tx) => tx.select().from(claims).where(and(eq(claims.tenantId, auth.tenantId), eq(claims.missionId, missionId), eq(claims.subjectEntityId, opportunity.organizationId)))),
    ]);
    const claimIds = claimRows.map((claim) => claim.id);
    const evidence = claimIds.length ? await this.read(auth, (tx) => tx.select({ claim: claims, link: claimEvidenceLinks, evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(claimEvidenceLinks).innerJoin(claims, eq(claims.id, claimEvidenceLinks.claimId)).innerJoin(evidenceItems, eq(evidenceItems.id, claimEvidenceLinks.evidenceItemId)).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(claims.tenantId, auth.tenantId), eq(claims.missionId, missionId), inArray(claimEvidenceLinks.claimId, claimIds)))) : [];
    return { opportunity, stateHistory, organization, route, stakeholders, contacts: contactLinks, latestScore: scoreHistory[0], scoreHistory, evidence: evidence.filter((row) => row.evidence.stance === 'support'), counterEvidence: evidence.filter((row) => row.evidence.stance === 'oppose'), actionCards: cards, interactions: interactionHistory, workflowProgress, pendingUnknowns: claimRows.filter((claim) => claim.status === 'unknown').map((claim) => claim.statement), domainEventChain: stateHistory };
  }
  async updateOpportunity(auth: AuthContext, missionId: string, opportunityId: string, input: Partial<typeof opportunities.$inferInsert>) { requirePermission(auth.role, 'mission:write'); const current = await this.queries.opportunity(auth.tenantId, missionId, opportunityId); if (!current) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' }); if (input.status) assertTransition('opportunity', opportunityTransitions, current.status, input.status); return this.mutate(auth, { aggregateType: 'opportunity', aggregateId: opportunityId, eventType: input.status ? 'opportunity.state_transitioned.v1' : 'opportunity.updated.v1', missionId, opportunityId, before: current }, async (tx) => (await tx.update(opportunities).set({ ...input, updatedAt: new Date() }).where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.missionId, missionId), eq(opportunities.id, opportunityId))).returning())[0]); }
  async researchOpportunity(auth: AuthContext, missionId: string, opportunityId: string) { await this.queries.opportunity(auth.tenantId, missionId, opportunityId).then((row) => { if (!row) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' }); }); const requestId = randomUUID(); await this.temporal.signalOpportunity(auth.tenantId, opportunityId, 'manualResearchRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId }; }
  async pauseOpportunity(auth: AuthContext, missionId: string, opportunityId: string) { await this.queries.opportunity(auth.tenantId, missionId, opportunityId).then((row) => { if (!row) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' }); }); await this.temporal.signalOpportunity(auth.tenantId, opportunityId, 'opportunityPauseRequested', { requestedByUserId: auth.userId }); return this.updateOpportunity(auth, missionId, opportunityId, { status: 'paused' }); }
  async resumeOpportunity(auth: AuthContext, missionId: string, opportunityId: string, resumeStatus: typeof opportunities.$inferInsert.status = 'target_identified') { await this.queries.opportunity(auth.tenantId, missionId, opportunityId).then((row) => { if (!row) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' }); }); await this.temporal.signalOpportunity(auth.tenantId, opportunityId, 'opportunityResumeRequested', { requestedByUserId: auth.userId }); return this.updateOpportunity(auth, missionId, opportunityId, { status: resumeStatus }); }
  archiveOpportunity(auth: AuthContext, missionId: string, opportunityId: string) { return this.updateOpportunity(auth, missionId, opportunityId, { status: 'archived' }); }
  scores(auth: AuthContext, missionId: string, opportunityId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.scores(auth.tenantId, missionId, opportunityId); }

  actionCards(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.actionCards(auth.tenantId, missionId); }
  async actionCard(auth: AuthContext, missionId: string, actionCardId: string) { const [row] = await this.read(auth, (tx) => tx.select({ actionCard: actionCards, opportunity: opportunities }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(and(eq(actionCards.tenantId, auth.tenantId), eq(opportunities.missionId, missionId), eq(actionCards.id, actionCardId))).limit(1)); if (!row) throw new DomainError({ code: 'ACTION_CARD_NOT_FOUND', message: 'Action card not found' }); return row; }
  async updateActionCard(auth: AuthContext, missionId: string, actionCardId: string, input: Partial<typeof actionCards.$inferInsert> & { expectedVersionNo?: number }) {
    requirePermission(auth.role, 'mission:write');
    const current = await this.actionCard(auth, missionId, actionCardId);
    if (input.expectedVersionNo !== undefined && current.actionCard.versionNo !== input.expectedVersionNo) throw new DomainError({ code: 'ACTION_CARD_VERSION_CONFLICT', message: 'Action Card version does not match expectedVersionNo', details: { expected: input.expectedVersionNo, actual: current.actionCard.versionNo }, retryable: true });
    const changes = { ...input };
    delete changes.expectedVersionNo;
    if (changes.status) {
      assertTransition('action_card', actionCardTransitions, current.actionCard.status, changes.status);
      return this.mutate(auth, { aggregateType: 'action_card', aggregateId: actionCardId, eventType: changes.status === 'executed' ? 'action_card.executed.v1' : 'action_card.version_created.v1', missionId, opportunityId: current.opportunity.id, before: current.actionCard }, async (tx) => (await tx.update(actionCards).set({ ...changes, updatedAt: new Date() }).where(and(eq(actionCards.tenantId, auth.tenantId), eq(actionCards.id, actionCardId), eq(actionCards.versionNo, current.actionCard.versionNo))).returning())[0]);
    }
    if (!['draft', 'review', 'changes_requested'].includes(current.actionCard.status)) throw new DomainError({ code: 'ACTION_CARD_STATE_CONFLICT', message: 'Approved or executed Action Cards are immutable; regenerate a new version to change content' });
    const nextId = randomUUID();
    const nextVersionNo = current.actionCard.versionNo + 1;
    const created = await this.mutate(auth, { aggregateType: 'action_card', aggregateId: nextId, eventType: 'action_card.version_created.v1', missionId, opportunityId: current.opportunity.id, before: current.actionCard }, async (tx) => {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, approvedBy: _approvedBy, approvedAt: _approvedAt, ...base } = current.actionCard;
      const [card] = await tx.insert(actionCards).values({ ...base, ...changes, id: nextId, versionNo: nextVersionNo, basedOnVersionNo: current.actionCard.versionNo, feedbackRefs: [...current.actionCard.feedbackRefs, current.actionCard.id], status: 'review', approvedBy: null, approvedAt: null }).returning();
      if (!card) throw new Error('Action Card version insert returned no row');
      const evidence = await tx.select().from(actionCardEvidenceLinks).where(eq(actionCardEvidenceLinks.actionCardId, current.actionCard.id));
      for (const link of evidence) await tx.insert(actionCardEvidenceLinks).values({ actionCardId: card.id, evidenceItemId: link.evidenceItemId }).onConflictDoNothing();
      await tx.insert(approvals).values({ tenantId: auth.tenantId, missionId, opportunityId: current.opportunity.id, actionCardId: card.id, approvalType: 'action_card', status: 'pending', requestedBy: auth.userId });
      return card;
    });
    await this.temporal.signalOpportunity(auth.tenantId, current.opportunity.id, 'actionCardVersionCreated', { actionCardId: created.id, versionNo: created.versionNo, createdByUserId: auth.userId });
    return created;
  }
  async decideActionCard(auth: AuthContext, missionId: string, actionCardId: string, input: { decision: 'approve' | 'request_changes'; expectedVersionNo: number; comment?: string }) {
    requirePermission(auth.role, input.decision === 'approve' ? 'action:approve' : 'mission:write');
    const row = await this.actionCard(auth, missionId, actionCardId);
    if (row.actionCard.versionNo !== input.expectedVersionNo) throw new DomainError({ code: 'ACTION_CARD_VERSION_CONFLICT', message: 'Action Card version does not match expectedVersionNo', details: { expected: input.expectedVersionNo, actual: row.actionCard.versionNo }, retryable: true });
    if (input.decision === 'request_changes' && !input.comment?.trim()) throw new DomainError({ code: 'ACTION_CARD_COMMENT_REQUIRED', message: 'A change request comment is required' });
    if (row.actionCard.status !== 'review') throw new DomainError({ code: 'ACTION_CARD_STATE_CONFLICT', message: 'Only the current review version can receive a decision' });
    const commandId = randomUUID(); const correlationId = randomUUID();
    const workflowId = row.opportunity.workflowId ?? `opportunity:${auth.tenantId}:${row.opportunity.id}`;
    await this.temporal.signalOpportunity(auth.tenantId, row.opportunity.id, 'actionCardDecision', { actionCardId, decision: input.decision, ...(input.comment ? { comment: input.comment } : {}), decidedByUserId: auth.userId, expectedVersionNo: input.expectedVersionNo });
    return this.commandReceipt({ commandId, correlationId, aggregateId: actionCardId, missionId, workflowId });
  }
  approveActionCard(auth: AuthContext, missionId: string, actionCardId: string) { return this.actionCard(auth, missionId, actionCardId).then((row) => this.decideActionCard(auth, missionId, actionCardId, { decision: 'approve', expectedVersionNo: row.actionCard.versionNo })); }
  requestActionChanges(auth: AuthContext, missionId: string, actionCardId: string, comment?: string) { return this.actionCard(auth, missionId, actionCardId).then((row) => this.decideActionCard(auth, missionId, actionCardId, { decision: 'request_changes', expectedVersionNo: row.actionCard.versionNo, comment })); }
  async regenerateActionCard(auth: AuthContext, missionId: string, actionCardId: string) { const row = await this.actionCard(auth, missionId, actionCardId); const requestId = randomUUID(); await this.temporal.signalOpportunity(auth.tenantId, row.opportunity.id, 'manualResearchRequested', { requestId, requestedByUserId: auth.userId, focus: 'regenerate_action_card' }); return { requested: true, requestId, opportunityId: row.opportunity.id }; }
  async executeActionCard(auth: AuthContext, missionId: string, actionCardId: string) { const row = await this.actionCard(auth, missionId, actionCardId); const card = await this.updateActionCard(auth, missionId, actionCardId, { status: 'executed' }); await this.updateOpportunity(auth, missionId, row.opportunity.id, { status: 'contacted' }); return card; }

  async actionCardExport(auth: AuthContext, missionId: string, actionCardId: string, format: 'markdown' | 'csv'): Promise<{ content: string; filename: string; contentType: string }> {
    requirePermission(auth.role, 'export:approved');
    const row = await this.actionCard(auth, missionId, actionCardId);
    const card = row.actionCard;
    if (!['approved', 'exported', 'executed', 'completed'].includes(card.status)) throw new DomainError({ code: 'ACTION_CARD_APPROVAL_REQUIRED', message: 'Action card must be approved before export' });
    const mission = await this.mission(auth, missionId);
    const [organization, route, stakeholder, primaryContact, backupContact, owner, missionEntity, evidenceRows] = await this.read(auth, (tx) => Promise.all([
      tx.select().from(entities).where(and(eq(entities.tenantId, auth.tenantId), eq(entities.id, row.opportunity.organizationId))).limit(1).then((rows) => rows[0]),
      tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, auth.tenantId), eq(marketRoutes.missionId, missionId), eq(marketRoutes.id, row.opportunity.routeId))).limit(1).then((rows) => rows[0]),
      card.targetStakeholderRoleId ? tx.select().from(stakeholderRoles).where(and(eq(stakeholderRoles.tenantId, auth.tenantId), eq(stakeholderRoles.missionId, missionId), eq(stakeholderRoles.id, card.targetStakeholderRoleId))).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      card.primaryContactPointId ? tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(contactPoints.id, card.primaryContactPointId))).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      card.backupContactPointId ? tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId), eq(contactPoints.id, card.backupContactPointId))).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      card.ownerId ? tx.select().from(users).where(eq(users.id, card.ownerId)).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      tx.select().from(missionEntities).where(and(eq(missionEntities.missionId, missionId), eq(missionEntities.entityId, row.opportunity.organizationId))).limit(1).then((rows) => rows[0]),
      tx.select({ evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(actionCardEvidenceLinks).innerJoin(evidenceItems, eq(evidenceItems.id, actionCardEvidenceLinks.evidenceItemId)).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(actionCardEvidenceLinks.actionCardId, card.id), eq(evidenceItems.tenantId, auth.tenantId), eq(evidenceItems.missionId, missionId))),
    ]));
    const slug = (value: string): string => value.normalize('NFKD').replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'action-card';
    const filenameBase = `${slug(mission.name)}-${slug(organization?.canonicalName ?? row.opportunity.title)}-action-card-v${card.versionNo}`;
    const correlationId = randomUUID();
    await this.transactions.run({ tenantId: auth.tenantId, actor: { type: 'user', id: auth.userId }, correlationId }, async (tx) => {
      if (card.status === 'approved') await tx.update(actionCards).set({ status: 'exported', updatedAt: new Date() }).where(and(eq(actionCards.tenantId, auth.tenantId), eq(actionCards.id, card.id), eq(actionCards.status, 'approved')));
      await this.eventWriter.append(tx, { tenantId: auth.tenantId, aggregateType: 'action_card', aggregateId: card.id, eventType: 'action_card.exported.v1', actorType: 'user', actorId: auth.userId, correlationId, payload: { tenantId: auth.tenantId, missionId, opportunityId: row.opportunity.id, aggregateId: card.id, actor: { type: 'user', id: auth.userId }, before: { status: card.status }, after: { status: card.status === 'approved' ? 'exported' : card.status }, evidenceRefs: evidenceRows.map((evidence) => evidence.evidence.id), metadata: { format, cardType: card.cardType } } });
    });
    if (format === 'csv') {
      const headers = ['mission_name','execution_mode','country','organization_name','organization_website','market_role','route_type','card_type','target_role','opportunity_status','priority','score','stakeholder_role','primary_contact_type','primary_contact_value','primary_contact_verified_at','backup_contact_type','backup_contact_value','action_reason','value_hypothesis','action_objective','email_subject','email_body','social_message','research_plan','unknowns','evidence_sources','next_action','owner','due_at'];
      const values = [mission.name, mission.executionMode, organization?.countryCode ?? '', organization?.canonicalName ?? '', organization?.website ?? '', missionEntity?.marketRoles.join('|') ?? '', route?.routeType ?? '', card.cardType, card.targetRoleLabel, row.opportunity.status, row.opportunity.priority, row.opportunity.score, stakeholder?.roleType ?? '', primaryContact?.contactType ?? '', primaryContact?.value ?? '', primaryContact?.lastVerifiedAt?.toISOString() ?? '', backupContact?.contactType ?? '', backupContact?.value ?? '', card.contactReason, card.valueHypothesis, card.objective, card.emailSubject ?? '', card.emailBody ?? '', card.socialMessage ?? '', card.researchPlan.join('|'), card.unknowns.join('|'), evidenceRows.map((evidence) => evidence.source.url ?? evidence.source.title ?? evidence.evidence.id).join('|'), row.opportunity.nextAction, owner?.displayName ?? '', card.dueAt?.toISOString() ?? ''];
      const content = `${headers.join(',')}\n${values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')}\n`;
      return { content, filename: `${filenameBase}.csv`, contentType: 'text/csv; charset=utf-8' };
    }
    const evidenceSection = evidenceRows.map((evidence, index) => `${index + 1}. ${evidence.source.title ?? evidence.source.url ?? 'Public source'}\n   - URL: ${evidence.source.url ?? 'Snapshot only'}\n   - Fetched: ${evidence.snapshot.fetchedAt.toISOString()}\n   - Content hash: ${evidence.snapshot.contentHash}\n   - Excerpt: ${evidence.evidence.excerpt}`).join('\n');
    const content = `# ${row.opportunity.title}\n\n- Mission: ${mission.name}\n- Execution mode: ${mission.executionMode}\n- Card type: ${card.cardType}\n- Status: ${card.status === 'approved' ? 'exported' : card.status}\n- Priority: ${row.opportunity.priority}\n- Score: ${row.opportunity.score}\n\n## Target Organization\n\n- Name: ${organization?.canonicalName ?? 'Unknown'}\n- Website: ${organization?.website ?? 'Unknown'}\n- Country: ${organization?.countryCode ?? 'Unknown'}\n- Market role: ${missionEntity?.marketRoles.join(', ') ?? 'Unknown'}\n- Target role: ${card.targetRoleLabel}\n\n## Approved Route\n\n- Route: ${route?.title ?? 'Unknown'}\n- Hypothesis: ${route?.hypothesis ?? 'Unknown'}\n\n## Action\n\n### Objective\n\n${card.objective}\n\n### Why this action\n\n${card.contactReason}\n\n### Why now\n\n${card.timingReason}\n\n### Stakeholder interest\n\n${card.stakeholderInterest}\n\n### Value hypothesis\n\n${card.valueHypothesis}\n\n## Contact Path\n\n- Channel: ${card.channel ?? 'Research required'}\n- Primary: ${primaryContact ? `${primaryContact.contactType} · ${primaryContact.value} · verified ${primaryContact.lastVerifiedAt?.toISOString() ?? 'Unknown'}` : 'No verified public contact path'}\n- Backup: ${backupContact ? `${backupContact.contactType} · ${backupContact.value}` : 'Unknown'}\n\n## Outreach Content\n\n- Email subject: ${card.emailSubject ?? 'Not applicable'}\n\n${card.emailBody ?? card.socialMessage ?? card.callOpening ?? 'Not applicable'}\n\n## Research Plan\n\n${card.researchPlan.length > 0 ? card.researchPlan.map((item) => `- ${item}`).join('\n') : '- Not applicable'}\n\n## Unknowns\n\n${card.unknowns.length > 0 ? card.unknowns.map((item) => `- ${item}`).join('\n') : '- None recorded'}\n\n## Success Signals\n\n${card.successSignals.map((item) => `- ${item}`).join('\n')}\n\n## Public Evidence\n\n${evidenceSection || 'No linked evidence'}\n`;
    return { content, filename: `${filenameBase}.md`, contentType: 'text/markdown; charset=utf-8' };
  }

  async addInteraction(auth: AuthContext, missionId: string, opportunityId: string, input: { actionCardId?: string; interactionType: typeof interactions.$inferInsert.interactionType; occurredAt: string; targetContactPointId?: string; channel?: string; summary: string; rawContent: string; outcome: string; submittedFacts?: Array<Record<string, unknown>>; nextAction?: string; followUpAt?: string }) {
    requirePermission(auth.role, 'interaction:write');
    const opportunity = await this.queries.opportunity(auth.tenantId, missionId, opportunityId);
    if (!opportunity) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' });
    if (input.actionCardId) await this.actionCard(auth, missionId, input.actionCardId);
    if (input.targetContactPointId) await this.contactRow(auth, missionId, input.targetContactPointId);
    const interactionId = randomUUID(); const commandId = randomUUID(); const correlationId = randomUUID();
    await this.transactions.run({ tenantId: auth.tenantId, actor: { type: 'user', id: auth.userId }, correlationId }, async (tx) => {
      await tx.insert(interactions).values({ id: interactionId, tenantId: auth.tenantId, missionId, opportunityId, actionCardId: input.actionCardId, interactionType: input.interactionType, occurredAt: new Date(input.occurredAt), actorUserId: auth.userId, targetContactPointId: input.targetContactPointId, channel: input.channel, summary: input.summary, rawContent: input.rawContent, rawContentHash: input.rawContent ? createHash('sha256').update(input.rawContent).digest('hex') : undefined, outcome: input.outcome, newFacts: input.submittedFacts ?? [], nextAction: input.nextAction, followUpAt: input.followUpAt ? new Date(input.followUpAt) : undefined, interpretationStatus: 'pending' });
      await this.eventWriter.append(tx, { tenantId: auth.tenantId, aggregateType: 'interaction', aggregateId: interactionId, eventType: 'interaction.recorded.v1', actor: { type: 'user', id: auth.userId }, correlationId, payload: { tenantId: auth.tenantId, missionId, opportunityId, aggregateId: interactionId, actor: { type: 'user', id: auth.userId }, after: { interactionId, interactionType: input.interactionType, interpretationStatus: 'pending' } } });
    });
    const workflowId = opportunity.workflowId ?? `opportunity:${auth.tenantId}:${opportunityId}`;
    await this.temporal.signalOpportunity(auth.tenantId, opportunityId, 'interactionRecorded', { interactionId, recordedByUserId: auth.userId });
    return this.commandReceipt({ commandId, correlationId, aggregateId: interactionId, interactionId, missionId, workflowId });
  }
  interactions(auth: AuthContext, missionId: string, opportunityId?: string) { requirePermission(auth.role, 'mission:read'); return this.queries.interactions(auth.tenantId, missionId, opportunityId); }
  timeline(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.queries.timeline(auth.tenantId, missionId); }
  runs(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'run:read'); return this.queries.runs(auth.tenantId, missionId); }
  async run(auth: AuthContext, missionId: string, runId: string) { const rows = await this.queries.runs(auth.tenantId, missionId); const run = rows.find((row) => row.runId === runId); if (!run) throw new DomainError({ code: 'RUN_NOT_FOUND', message: 'Run not found' }); return run; }

  async refreshProposals(auth: AuthContext, missionId: string) { requirePermission(auth.role, 'mission:read'); return this.read(auth, (tx) => tx.select({ artifact: artifacts, version: artifactVersions }).from(artifacts).innerJoin(artifactVersions, eq(artifactVersions.artifactId, artifacts.id)).where(and(eq(artifacts.tenantId, auth.tenantId), eq(artifacts.missionId, missionId), eq(artifacts.artifactType, 'refresh_proposal'))).orderBy(desc(artifactVersions.createdAt))); }
  async refreshProposal(auth: AuthContext, missionId: string, proposalId: string) { const proposals = await this.refreshProposals(auth, missionId); const proposal = proposals.find((row) => row.version.id === proposalId || row.artifact.id === proposalId); if (!proposal) throw new DomainError({ code: 'REFRESH_PROPOSAL_NOT_FOUND', message: 'Refresh proposal not found' }); return proposal; }
  async acceptRefreshProposal(auth: AuthContext, missionId: string, proposalId: string) { requirePermission(auth.role, 'mission:write'); const proposal = await this.refreshProposal(auth, missionId, proposalId); return this.mutate(auth, { aggregateType: 'refresh', aggregateId: proposal.artifact.id, eventType: 'refresh.proposal_accepted.v1', missionId }, async (tx) => { await tx.update(artifactVersions).set({ status: 'superseded' }).where(and(eq(artifactVersions.artifactId, proposal.artifact.id), eq(artifactVersions.status, 'accepted'))); const [version] = await tx.update(artifactVersions).set({ status: 'accepted', acceptedByUserId: auth.userId, acceptedAt: new Date() }).where(eq(artifactVersions.id, proposal.version.id)).returning(); await tx.update(artifacts).set({ currentVersionId: proposal.version.id, updatedAt: new Date() }).where(eq(artifacts.id, proposal.artifact.id)); return version; }); }
  async researchRefreshProposal(auth: AuthContext, missionId: string, proposalId: string) { await this.refreshProposal(auth, missionId, proposalId); const requestId = randomUUID(); await this.temporal.signalMission(auth.tenantId, missionId, 'manualRefreshRequested', { requestId, requestedByUserId: auth.userId }); return { requested: true, requestId }; }
  async deferRefreshProposal(auth: AuthContext, missionId: string, proposalId: string) { const proposal = await this.refreshProposal(auth, missionId, proposalId); return this.mutate(auth, { aggregateType: 'refresh', aggregateId: proposal.artifact.id, eventType: 'artifact.changes_requested.v1', missionId }, (tx) => tx.update(artifactVersions).set({ status: 'changes_requested' }).where(eq(artifactVersions.id, proposal.version.id)).returning()); }
}
