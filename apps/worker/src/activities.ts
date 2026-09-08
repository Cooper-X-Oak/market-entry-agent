import { bindCompiledScope, executionControl, ExecutionError, contactContentSupports } from '@imea/agents';
import { normalizeResearchDefinition, withinResearchRegions } from '@imea/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AgentRunner } from '@imea/agents';
import type {
  ActionCardResult, ActivityCommandScope, AgentTaskInput, BudgetConfig, ContactVerificationFacts,
  EntityCandidate, InteractionInterpretation, MarketRouteResearchResult, MissionBrief, OpportunityStatus, TargetRankingResult,
} from '@imea/contracts';
import type { Connector, ObjectStorageConnector } from '@imea/connectors';
import {
  actionCardEvidenceLinks, actionCards, agentRuns, approvals, ArtifactRepository, artifacts, artifactVersions, claimEvidenceLinks, claims,
  competitorProfiles, contactPointEvidenceLinks, contactPoints, contactVerificationEvidenceLinks,
  contactVerifications, DomainEventWriter, domainEvents, entities, entityRelationships, evidenceItems,
  idempotencyRecords, industryOpinions, interactionClaimLinks, interactionEvidenceLinks, interactions,
  marketRoutes, missionEntities, missionSources, missions, opportunities, opportunityContacts, opportunityScores,
  opportunityStakeholders, refreshProposals, routeEvidenceLinks, sources, sourceSnapshots, stakeholderRoles,
  targetAssessmentEvidenceLinks, targetAssessments, toolRuns,
  TransactionManager, workflowInstances, type Database, type DatabaseTransaction,
} from '@imea/database';
import { actionCardGate, capabilityReviewGate, deriveContactVerificationStatus, researchActionCardGate, routeApprovalGate, routeReviewGate, scoreOpportunity, targetGate, transitionOpportunity } from '@imea/domain';
import { budgetState } from '@imea/policies';
import type { ActivityResult, MarketEntryActivities, Scoped, TemporalGateway } from '@imea/workflows';
import { ApplicationFailure } from '@temporalio/common';

interface AgentEnvelope<T> {
  result: T;
  proposedClaims: Array<{ claimType: string; statement: string; value: unknown; confidence: number; evidenceRefs: string[]; impactLevel: string }>;
  unknowns: Array<{ question: string; impact: string; recommendedTask?: string }>;
  contradictions: Array<{ claimRef?: string; description: string; evidenceRefs: string[] }>;
  recommendedEvents: Array<{ eventType: string; payload: Record<string, unknown> }>;
  quality: { schemaValid: boolean; evidenceCoverage: number; confidence: number };
}

interface CapabilityResult { claims: Array<{ category: string; statement: string; status: 'observed' | 'inferred' | 'unknown'; confidence: number; evidenceRefs: string[]; currentMissionImpact: 'low' | 'medium' | 'high' }>; missingCapabilities: Array<{ capability: string; routeDependency: string; questionForUser: string }> }
interface CompetitorResult { competitors: Array<{ entityCandidate: EntityCandidate; marketPresenceSummary: string; routePatterns: string[]; localChannels: EntityCandidate[]; exhibitions: EntityCandidate[]; publicCustomers: EntityCandidate[]; certifications: string[]; serviceNetwork: string[]; marketMinimums: string[]; opportunityGaps: string[]; evidenceRefs: string[]; confidence: number }> }
interface ExpertResult { opinions: Array<{ person?: EntityCandidate; organization?: EntityCandidate; topic: string; positionSummary: string; marketImplication: string; credibilityScore: number; commercialInterest?: string; contactable: boolean; evidenceRefs: string[] }> }
interface EcosystemResult { entities: EntityCandidate[]; relationships: Array<{ sourceCandidateKey: string; targetCandidateKey: string; relationshipType: typeof entityRelationships.$inferInsert.relationshipType; confidence: number; evidenceRefs: string[] }> }
interface StakeholderResult { stakeholders: Array<{ personCandidate?: EntityCandidate; roleType: typeof stakeholderRoles.$inferInsert.roleType; title?: string; decisionInfluence: number; contactPriority: number; relevanceReason: string; evidenceRefs: string[]; confidence: number }> }
interface ContactResult { contactPoints: Array<{ personName?: string; stakeholderRoleType?: string; contactType: typeof contactPoints.$inferInsert.contactType; value: string; normalizedValue: string; label?: string; isPublic: boolean; contactEvidenceRefs: string[]; employmentEvidenceRefs: string[]; sourceAuthority: string; independentGroupKeys: string[]; confidence: number; language?: string; timezone?: string; recommendedRank: number }> }
interface QualificationResult { hypothesis: string; recommendedStatus: string; commercialValueBand: 'very_low' | 'low' | 'medium' | 'high' | 'strategic'; estimatedSalesHours: number; estimatedTechnicalHours: number; estimatedMarketCostPoints: number; scores: { productFit: number; routeFit: number; demandSignal: number; timingSignal: number; stakeholderRelevance: number; contactability: number; evidenceQuality: number; strategicValue: number }; rationale: Record<string, string>; nextAction: string; evidenceRefs: string[]; unknowns: string[] }
interface EntityResolutionResult { decision: 'create' | 'merge' | 'link'; matchedEntityId?: string; canonicalName: string; confidence: number; reasons: string[]; evidenceRefs: string[] }

const terminalDate = new Date('2099-12-31T00:00:00.000Z');
const ok = (id: string = randomUUID(), metadata?: Record<string, unknown>): ActivityResult => ({ id, status: 'succeeded', ...(metadata ? { metadata } : {}) });
const asUuid = (seed: string): string => { const hash = createHash('sha256').update(seed).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`; };
const normalizedWebsite = (value?: string | null): string | undefined => { if (!value) return undefined; try { return new URL(value).toString().replace(/\/$/, '').toLowerCase(); } catch { return undefined; } };
const sourceHost = (value?: string | null): string | undefined => { if (!value) return undefined; try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return undefined; } };

/** Execution/fencing metadata is not business payload. Arrays retain their order. */
export function activityBusinessRequestHash(input: ActivityCommandScope): string {
  const metadata = new Set(['scopeVersion', 'missionExecutionId', 'ownershipRunId', 'idempotencyKey', 'correlationId', 'causationId', 'requestedBy', 'businessId', 'recoveredFromRunId', 'recoveredRunId']);
  const normalize = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(item => normalize(item) ?? null);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalize(v)]));
    return value;
  };
  return createHash('sha256').update(JSON.stringify(normalize(Object.fromEntries(Object.entries(input).filter(([key]) => !metadata.has(key)))))).digest('hex');
}

export function activityIdentity(input: ActivityCommandScope, activityType: string): { endpoint: string; key: string } {
  if (input.scopeVersion === 2) {
    if (!input.missionExecutionId || !input.businessId) throw ApplicationFailure.nonRetryable('V2 Activity execution identity is incomplete', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
    return { endpoint: `activity:v2:${activityType}`, key: `v2:${input.missionExecutionId}:${input.businessId}` };
  }
  return { endpoint: `activity:${activityType}`, key: input.idempotencyKey };
}

export class ActivityService implements MarketEntryActivities {
  private readonly transactions: TransactionManager;
  private readonly artifactRepository = new ArtifactRepository();
  private readonly events = new DomainEventWriter();

  constructor(
    private readonly db: Database,
    private readonly runner: AgentRunner,
    private readonly storage: ObjectStorageConnector,
    private readonly connectors: ReadonlyMap<string, Connector>,
    private readonly temporal: TemporalGateway,
  ) { this.transactions = new TransactionManager(db); }

  async registerMissionRecovery(input: Scoped<{ recoveredFromRunId: string; recoveredRunId: string; historyScopeVersion: 1 | 2; recoveryStage: 'researching_routes' }>): Promise<void> {
    if (!input.missionExecutionId) throw ApplicationFailure.nonRetryable('Recovery execution identity missing', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
    const current = await this.temporal.describeMission(input.tenantId, input.missionId);
    if (current.runId !== input.recoveredRunId || current.status !== 'RUNNING') throw ApplicationFailure.nonRetryable('Reset execution is not current', 'ACTIVITY_STALE_OWNER');
    const endpoint = 'activity:v2:registerMissionRecovery';
    const key = `v2:${input.missionExecutionId}:${input.businessId ?? input.missionId}`;
    const requestHash = activityBusinessRequestHash(input);
    await this.read(input, async tx => {
      await tx.execute(sql`select id from missions where id=${input.missionId} for update`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${endpoint}:${key}`}, 0))`);
      const [existing] = await tx.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.tenantId, input.tenantId), eq(idempotencyRecords.endpoint, endpoint), eq(idempotencyRecords.idempotencyKey, key)));
      if (existing) {
        if (existing.requestHash !== requestHash) throw ApplicationFailure.nonRetryable('Recovery payload mismatch', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
        return;
      }
      const [before] = await tx.select().from(missions).where(eq(missions.id, input.missionId));
      await tx.execute(sql`update workflow_instances set run_id=${input.recoveredRunId}, mission_execution_id=${input.missionExecutionId}::uuid, scope_version=${input.historyScopeVersion}, status='running', closed_at=null, updated_at=now() where tenant_id=${input.tenantId}::uuid and workflow_id=${`mission:${input.tenantId}:${input.missionId}`}`);
      await tx.update(missions).set({ status: 'paused', currentStage: input.recoveryStage, completedAt: null, updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      await this.event(tx, input, 'mission', input.missionId, 'mission.paused.v1', { before: { status: before?.status }, after: { status: 'paused', stage: input.recoveryStage }, metadata: { reason: 'recovered_at_first_unfinished_node', missionExecutionId: input.missionExecutionId, sourceRunId: input.recoveredFromRunId, runId: input.recoveredRunId } });
      await tx.insert(idempotencyRecords).values({ tenantId: input.tenantId, endpoint, idempotencyKey: key, requestHash, responseStatus: 200, responseBody: { value: null }, expiresAt: terminalDate });
    });
  }

  async reconcileClosedMission(input: Scoped, terminal: { status: string; runId: string }): Promise<void> {
    if (!['FAILED', 'CANCELLED', 'TERMINATED', 'TIMED_OUT', 'COMPLETED'].includes(terminal.status)) return;
    await this.read(input, async tx => {
      await tx.execute(sql`select id from missions where id=${input.missionId} for update`);
      const [mission] = await tx.select().from(missions).where(and(eq(missions.tenantId, input.tenantId), eq(missions.id, input.missionId))).limit(1);
      if (!mission || ['failed', 'completed', 'archived'].includes(mission.status)) return;
      const current = await this.temporal.describeMission(input.tenantId, input.missionId);
      if (current.runId !== terminal.runId || current.status !== terminal.status) return;
      // A stale closed execution must never terminate a newer run of this Mission.
      const status = terminal.status === 'COMPLETED' ? 'completed' as const : 'failed' as const;
      await tx.update(missions).set({ status, currentStage: status, completedAt: new Date(), updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      await tx.update(workflowInstances).set({ status: terminal.status === 'COMPLETED' ? 'completed' : terminal.status === 'TERMINATED' ? 'terminated' : 'failed', closedAt: new Date(), updatedAt: new Date() }).where(eq(workflowInstances.workflowId, mission.workflowId ?? ''));
      await this.event(tx, input, 'mission', input.missionId, `mission.${status}.v1`, { before: { status: mission.status }, after: { status, stage: status }, metadata: { workflowStatus: terminal.status, workflowRunId: terminal.runId, providerServerCompletion: 'unknown', reason: 'workflow_reconciliation' } });
    });
  }

  private transactionContext(input: ActivityCommandScope) {
    return { tenantId: input.tenantId, actor: input.requestedBy ?? { type: 'system' as const, id: 'temporal-worker' }, correlationId: input.correlationId, ...(input.causationId ? { causationId: input.causationId } : {}) };
  }

  private async read<T>(input: ActivityCommandScope, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.transactionContext(input), work);
  }

  private async idempotent<T>(input: ActivityCommandScope, activityType: string, work: () => Promise<T>): Promise<T> {
    const { endpoint, key } = activityIdentity(input, activityType);
    const requestHash = activityBusinessRequestHash(input);
    return this.transactions.run(this.transactionContext(input), async (tx) => {
      await this.assertExecutionOwner(input, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${endpoint}:${key}`}, 0))`);
      const [existing] = await tx.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.tenantId, input.tenantId), eq(idempotencyRecords.endpoint, endpoint), eq(idempotencyRecords.idempotencyKey, key))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw ApplicationFailure.nonRetryable('Activity Idempotency-Key payload mismatch', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
        return (existing.responseBody as { value: T }).value;
      }
      await tx.execute(sql`select id from missions where id=${input.missionId} for update`);
      const [missionState] = await tx.select({ status: missions.status }).from(missions).where(eq(missions.id, input.missionId)).limit(1);
      if (missionState && ['failed', 'completed', 'archived'].includes(missionState.status)) throw ApplicationFailure.nonRetryable('Mission is terminal', 'MISSION_TERMINAL');
      executionControl.getStore()?.signal?.throwIfAborted();
      const value = await work();
      executionControl.getStore()?.signal?.throwIfAborted();
      await tx.insert(idempotencyRecords).values({ tenantId: input.tenantId, idempotencyKey: key, endpoint, requestHash, responseStatus: 200, responseBody: { value: value ?? null }, expiresAt: terminalDate }).onConflictDoNothing();
      return value;
    });
  }

  private async assertExecutionOwner(input: ActivityCommandScope, tx: DatabaseTransaction): Promise<void> {
      await tx.execute(sql`select id from missions where id=${input.missionId} for update`);
      const control = executionControl.getStore();
      if (input.ownershipRunId || control?.workflowId?.startsWith('mission:') && control.workflowRunId) {
        const [owner] = await tx.select().from(workflowInstances).where(eq(workflowInstances.workflowId, `mission:${input.tenantId}:${input.missionId}`));
        const actualOwner = control?.workflowId?.startsWith('mission:') ? control.workflowRunId : input.ownershipRunId;
        if (!owner || owner.runId !== actualOwner) throw ApplicationFailure.nonRetryable('Stale Workflow execution', 'ACTIVITY_STALE_OWNER');
        if (input.scopeVersion === 2 && input.missionExecutionId) await tx.execute(sql`update workflow_instances set mission_execution_id=${input.missionExecutionId}::uuid, scope_version=2 where workflow_id=${owner.workflowId} and run_id=${actualOwner}`);
      }
  }

  private async prepared<P, T>(input: ActivityCommandScope, activityType: string, prepare: () => Promise<P>, commit: (prepared: P) => Promise<T>): Promise<T> {
    const { endpoint, key } = activityIdentity(input, activityType);
    const requestHash = activityBusinessRequestHash(input);
    const lookup = (suffix: string) => this.read(input, async tx => (await tx.select().from(idempotencyRecords).where(and(
      eq(idempotencyRecords.tenantId, input.tenantId), eq(idempotencyRecords.endpoint, endpoint + suffix), eq(idempotencyRecords.idempotencyKey, key))).limit(1))[0]);
    await this.read(input, tx => this.assertExecutionOwner(input, tx));
    const completed = await lookup('');
    if (completed) {
      if (completed.requestHash !== requestHash) throw ApplicationFailure.nonRetryable('Activity payload mismatch', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
      return (completed.responseBody as { value: T }).value;
    }
    const cached = await lookup(':prepared:module-correction-v1');
    if (cached && cached.requestHash !== requestHash) throw ApplicationFailure.nonRetryable('Prepared payload mismatch', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
    executionControl.getStore()?.signal?.throwIfAborted();
    let prepared: P;
    if (cached) prepared = (cached.responseBody as { value: P }).value;
    else {
      const result = await prepare(); // No business transaction spans network I/O.
      executionControl.getStore()?.signal?.throwIfAborted();
      await this.read(input, async tx => { await tx.insert(idempotencyRecords).values({ tenantId: input.tenantId,
        idempotencyKey: key, endpoint: endpoint + ':prepared:module-correction-v1', requestHash,
        responseStatus: 200, responseBody: { value: result }, expiresAt: terminalDate }).onConflictDoNothing(); });
      const persisted = await lookup(':prepared:module-correction-v1');
      if (!persisted) throw new ExecutionError('AUDIT_UNAVAILABLE', 'Validated result cache did not persist');
      prepared = (persisted.responseBody as { value: P }).value;
    }
    return this.idempotent(input, activityType, () => commit(prepared));
  }

  private async idempotentMutation<T>(input: ActivityCommandScope, activityType: string, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const { endpoint, key } = activityIdentity(input, activityType);
    const requestHash = activityBusinessRequestHash(input);
    return this.transactions.run(this.transactionContext(input), async (tx) => {
      await this.assertExecutionOwner(input, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${endpoint}:${key}`}, 0))`);
      const [existing] = await tx.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.tenantId, input.tenantId), eq(idempotencyRecords.endpoint, endpoint), eq(idempotencyRecords.idempotencyKey, key))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw ApplicationFailure.nonRetryable('Activity Idempotency-Key payload mismatch', 'ACTIVITY_IDEMPOTENCY_CONFLICT');
        return (existing.responseBody as { value: T }).value;
      }
      await tx.execute(sql`select id from missions where id=${input.missionId} for update`);
      const [missionState] = await tx.select({ status: missions.status }).from(missions).where(eq(missions.id, input.missionId)).limit(1);
      if (missionState && ['failed', 'completed', 'archived'].includes(missionState.status)) throw ApplicationFailure.nonRetryable('Mission is terminal', 'MISSION_TERMINAL');
      executionControl.getStore()?.signal?.throwIfAborted();
      const value = await work(tx);
      executionControl.getStore()?.signal?.throwIfAborted();
      await tx.insert(idempotencyRecords).values({ tenantId: input.tenantId, idempotencyKey: key, endpoint, requestHash, responseStatus: 200, responseBody: { value: value ?? null }, expiresAt: terminalDate });
      return value;
    });
  }

  private async mission(input: ActivityCommandScope) {
    return this.read(input, async (tx) => {
      const [row] = await tx.select().from(missions).where(and(eq(missions.tenantId, input.tenantId), eq(missions.id, input.missionId))).limit(1);
      if (!row) throw ApplicationFailure.nonRetryable('Mission not found', 'MISSION_NOT_FOUND');
      return row;
    });
  }

  private async opportunity(input: ActivityCommandScope & { opportunityId: string }) {
    return this.read(input, async (tx) => {
      const [row] = await tx.select().from(opportunities).where(and(eq(opportunities.tenantId, input.tenantId), eq(opportunities.missionId, input.missionId), eq(opportunities.id, input.opportunityId))).limit(1);
      if (!row) throw ApplicationFailure.nonRetryable('Opportunity not found', 'OPPORTUNITY_NOT_FOUND');
      return row;
    });
  }

  private async event(tx: DatabaseTransaction, input: ActivityCommandScope, aggregateType: string, aggregateId: string, eventType: string, values: { before?: unknown; after?: unknown; evidenceRefs?: string[]; opportunityId?: string; metadata?: Record<string, unknown> } = {}): Promise<string> {
    return this.events.append(tx, {
      tenantId: input.tenantId, aggregateType, aggregateId, eventType, schemaVersion: 1,
      actor: input.requestedBy ?? { type: 'system', id: 'temporal-worker' }, correlationId: input.correlationId, causationId: input.causationId,
      payload: { tenantId: input.tenantId, missionId: input.missionId, ...(values.opportunityId ? { opportunityId: values.opportunityId } : {}), aggregateId, actor: input.requestedBy ?? { type: 'system', id: 'temporal-worker' }, ...(values.before !== undefined ? { before: values.before } : {}), ...(values.after !== undefined ? { after: values.after } : {}), ...(values.evidenceRefs ? { evidenceRefs: values.evidenceRefs } : {}), ...(values.metadata ? { metadata: values.metadata } : {}) },
    });
  }

  private async artifactInTransaction(tx: DatabaseTransaction, input: ActivityCommandScope, artifactType: typeof artifacts.$inferInsert.artifactType, title: string, payload: unknown, summary: string, opportunityId?: string, evidenceRefs: string[] = []) {
    const version = await this.artifactRepository.writeProposal(tx, { tenantId: input.tenantId, missionId: input.missionId, opportunityId, artifactType, title, payload, summary });
    await tx.update(artifactVersions).set({ evidenceRefs }).where(eq(artifactVersions.id, version.id));
    await this.event(tx, input, 'artifact', version.artifactId, 'artifact.version_proposed.v1', { after: { versionId: version.id, versionNo: version.versionNo, artifactType }, evidenceRefs, ...(opportunityId ? { opportunityId } : {}) });
    return { ...version, evidenceRefs };
  }

  private async task(input: ActivityCommandScope, skillKey: string, objective: string): Promise<AgentTaskInput> {
    const mission = await this.mission(input);
    await this.enforceBudget(input, mission.budgetConfig as BudgetConfig);
    return this.read(input, async (tx) => {
      const [knownClaims, currentArtifacts, uploadedSources] = await Promise.all([
        tx.select().from(claims).where(and(eq(claims.tenantId, input.tenantId), eq(claims.missionId, input.missionId), inArray(claims.status, ['observed', 'inferred', 'user_confirmed', 'unknown']))),
        tx.select({ artifactId: artifacts.id, versionId: artifacts.currentVersionId, type: artifacts.artifactType }).from(artifacts).where(and(eq(artifacts.tenantId, input.tenantId), eq(artifacts.missionId, input.missionId))),
        tx.select({ objectKey: missionSources.objectKey, originalName: missionSources.originalName }).from(missionSources).where(and(eq(missionSources.tenantId, input.tenantId), eq(missionSources.missionId, input.missionId), eq(missionSources.sourceKind, 'uploaded_file'))),
      ]);
      const claimIds = knownClaims.map((claim) => claim.id);
      const links = claimIds.length > 0 ? await tx.select().from(claimEvidenceLinks).where(inArray(claimEvidenceLinks.claimId, claimIds)) : [];
      const budget = mission.budgetConfig as BudgetConfig;
      return {
        tenantId: input.tenantId, missionId: input.missionId, ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}), skillKey,
        objective: `${objective}\nResearch definition (user statements, not supplier capabilities): ${JSON.stringify(normalizeResearchDefinition(mission))}\nMission: ${mission.name}\nCompany: ${mission.companyName}\nWebsite: ${mission.companyWebsite}\nProducts: ${mission.productScope}\nCountries: ${mission.targetCountries.join(', ')}\nIndustries: ${mission.targetIndustries.join(', ')}`,
        artifactRefs: currentArtifacts.filter((artifact): artifact is typeof artifact & { versionId: string } => artifact.versionId !== null).map((artifact) => ({ artifactId: artifact.artifactId, versionId: artifact.versionId, type: artifact.type })),
        knownClaims: [
          { claimId: mission.id, statement: `website:${mission.companyWebsite}`, status: 'unknown', confidence: 0, evidenceRefs: [] },
          ...uploadedSources.filter((source): source is { objectKey: string; originalName: string | null } => Boolean(source.objectKey)).map((source) => ({ claimId: mission.id, statement: `document:${source.originalName ?? 'upload'}|${source.objectKey}`, status: 'unknown', confidence: 0, evidenceRefs: [] })),
          ...knownClaims.map((claim) => ({ claimId: claim.id, statement: claim.statement, status: claim.status, confidence: claim.confidence, evidenceRefs: links.filter((link) => link.claimId === claim.id).map((link) => link.evidenceItemId) })),
        ],
        openQuestions: knownClaims.filter((claim) => claim.status === 'unknown').map((claim) => claim.statement),
        toolPermissions: ['web_search', 'browser', 'company_website', 'document', 'tender_search', 'social_public_search', 'contact_verification'],
        budget: { maxSearchCalls: budget.maxSearchCalls, maxBrowserPages: budget.maxBrowserPages, maxModelTokens: budget.maxModelTokens },
        outputLanguage: mission.outputLanguages[0] ?? 'zh-CN',
      };
    });
  }

  private async enforceBudget(input: ActivityCommandScope, config: BudgetConfig): Promise<void> {
    const usage = await this.read(input, async (tx) => {
      const [agentCount, tokenCount, searchCount, browserCount, targetCount, contactCount] = await Promise.all([
        tx.select({ value: sql<number>`count(*)::int` }).from(agentRuns).where(eq(agentRuns.missionId, input.missionId)),
        tx.select({ value: sql<number>`coalesce(sum(${agentRuns.inputTokens} + ${agentRuns.outputTokens}), 0)::int` }).from(agentRuns).where(eq(agentRuns.missionId, input.missionId)),
        tx.select({ value: sql<number>`count(*)::int` }).from(toolRuns).where(and(eq(toolRuns.missionId, input.missionId), inArray(toolRuns.connectorType, ['web_search','tender_search','social_public_search']))),
        tx.select({ value: sql<number>`coalesce(sum(case when ${toolRuns.connectorType} in ('web_search','tender_search','social_public_search') then coalesce((${toolRuns.responseSummary}->>'itemCount')::int, 0) when ${toolRuns.connectorType} in ('browser','company_website','document') then 1 else 0 end), 0)::int` }).from(toolRuns).where(eq(toolRuns.missionId, input.missionId)),
        tx.select({ value: sql<number>`count(*)::int` }).from(missionEntities).where(and(eq(missionEntities.missionId, input.missionId), inArray(missionEntities.targetStatus, ['target','high_priority']))),
        tx.select({ value: sql<number>`count(*)::int` }).from(contactPoints).where(eq(contactPoints.missionId, input.missionId)),
      ]);
      return { searchCalls: searchCount[0]?.value ?? 0, browserPages: browserCount[0]?.value ?? 0, agentRuns: agentCount[0]?.value ?? 0, modelTokens: tokenCount[0]?.value ?? 0, targets: targetCount[0]?.value ?? 0, contactPaths: contactCount[0]?.value ?? 0 };
    });
    const state = budgetState(config, usage);
    if (state.state !== 'exhausted') return;
    await this.read(input, async (tx) => {
      const [existingEvent] = await tx.select({ id: domainEvents.id }).from(domainEvents).where(and(eq(domainEvents.tenantId, input.tenantId), eq(domainEvents.aggregateId, input.missionId), eq(domainEvents.eventType, 'mission.budget_review_requested.v1'))).limit(1);
      if (!existingEvent) await this.event(tx, input, 'mission', input.missionId, 'mission.budget_review_requested.v1', { metadata: { maximumRatio: state.maximumRatio, exhausted: state.exhausted } });
      await tx.update(missions).set({ currentStage: 'awaiting_budget_review', updatedAt: new Date() }).where(and(eq(missions.tenantId, input.tenantId), eq(missions.id, input.missionId)));
      await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, approvalType: 'budget_review', status: 'pending' }).onConflictDoNothing();
    });
    throw ApplicationFailure.nonRetryable(`Mission budget exhausted: ${state.exhausted.join(', ')}`, 'MISSION_BUDGET_EXHAUSTED', { exhausted: state.exhausted, maximumRatio: state.maximumRatio });
  }

  async loadMission(input: Scoped) { const mission = await this.mission(input); const budget = mission.budgetConfig as BudgetConfig; return { id: mission.id, budget, topTargetLimit: budget.maxTargets, supplierKnown: normalizeResearchDefinition(mission).supplier !== null }; }

  async compileMission(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'compileMission', async () => await this.runner.execute<AgentEnvelope<MissionBrief>>(await this.task(input, 'mission_compiler', 'Compile mission brief')), async (output) => {
    return this.read(input, async (tx) => {
      const [before] = await tx.select().from(missions).where(eq(missions.id, input.missionId)).limit(1);
      await tx.update(missions).set({ currentStage: 'compiling', status: 'running', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      const version = await this.artifactInTransaction(tx, input, 'mission_brief', 'Mission Brief', bindCompiledScope(output.result, before!), 'Structured mission scope and open questions', undefined, [...new Set(output.proposedClaims.flatMap(claim => claim.evidenceRefs))]);
      await this.event(tx, input, 'mission', input.missionId, 'mission.started.v1', { before, after: { status: 'running', stage: 'compiling' } });
      return ok(version.id, { artifactVersionId: version.id });
    });
  }); }

  async ingestCompanySources(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'ingestCompanySources', async () => {
    const mission = await this.mission(input);
    const supplier = normalizeResearchDefinition(mission).supplier;
    if (!supplier?.website) throw new ExecutionError('INPUT_MISSING', 'Supplier website unavailable; skip capability research');
    mission.companyWebsite = supplier.website;
    mission.companyName = supplier.name;
    const connector = this.connectors.get('browser') ?? this.connectors.get('company_website');
    if (!connector) throw ApplicationFailure.nonRetryable('Browser connector not configured', 'CONNECTOR_UNAVAILABLE');
    const result = await connector.execute({ tenantId: input.tenantId, missionId: input.missionId, operation: 'fetch_page', url: mission.companyWebsite });
    const item = result.items[0]; const content = item?.content ?? '';
    const suppliedContentHash = item?.metadata.contentHash;
    const contentHash = typeof suppliedContentHash === 'string' ? suppliedContentHash : createHash('sha256').update(content).digest('hex');
    const stored = result.rawObjectKey ? { objectKey: result.rawObjectKey, contentHash } : await this.storage.put(input.tenantId, input.missionId, 'company-website', content, 'text/plain');
    return { mission, item, content, stored, connectorType: connector.type };
  }, async ({ mission, item, content, stored, connectorType }) => {
    return this.read(input, async (tx) => {
      const normalizedUrl = new URL(mission.companyWebsite).toString();
      const [source] = await tx.insert(sources).values({ tenantId: input.tenantId, missionId: input.missionId, sourceType: 'company_website', url: mission.companyWebsite, normalizedUrl, title: item?.title ?? mission.companyName, language: mission.outputLanguages[0] ?? 'en', metadata: { authority: 'official_organization', independentGroupKey: new URL(normalizedUrl).hostname } }).onConflictDoUpdate({ target: [sources.tenantId, sources.missionId, sources.normalizedUrl], set: { lastFetchedAt: new Date(), status: 'active' } }).returning();
      if (!source) throw new Error('Company source insert returned no row');
      const [inserted] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, httpStatus: Number(item?.metadata.httpStatus ?? 200), contentHash: stored.contentHash, objectKey: stored.objectKey, extractedText: content, extractionMetadata: { connector: connectorType } }).onConflictDoNothing().returning();
      const snapshot = inserted ?? (await tx.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.sourceId, source.id), eq(sourceSnapshots.contentHash, stored.contentHash))).limit(1))[0];
      if (!snapshot) throw new Error('Company snapshot insert returned no row');
      await tx.update(sources).set({ latestSnapshotId: snapshot.id, lastFetchedAt: new Date() }).where(eq(sources.id, source.id));
      await tx.update(missions).set({ currentStage: 'ingesting_company_data', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      await this.event(tx, input, 'mission', input.missionId, 'mission.stage_changed.v1', { before: { stage: mission.currentStage }, after: { stage: 'ingesting_company_data', sourceSnapshotId: snapshot.id } });
      return ok(snapshot.id, { contentHash: stored.contentHash });
    });
  }); }

  async extractCapabilityClaims(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'extractCapabilityClaims', async () => {
    if (!normalizeResearchDefinition(await this.mission(input)).supplier) throw new ExecutionError('INPUT_MISSING', 'Supplier capabilities are not evaluated without a supplier');
    return this.runner.execute<AgentEnvelope<CapabilityResult>>(await this.task(input, 'capability_evidence_extractor', 'Extract minimum viable capability evidence'));
  }, async (output) => {
    return this.read(input, async (tx) => {
      const evidenceRefs = [...new Set(output.result.claims.flatMap((claim) => claim.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'capability_ledger', 'Capability Ledger', output.result, `${output.result.claims.length} capability claims`, undefined, evidenceRefs);
      for (const claim of output.result.claims) {
        const [created] = await tx.insert(claims).values({ tenantId: input.tenantId, missionId: input.missionId, claimType: claim.category, statement: claim.statement, valueJson: {}, status: claim.status, confidence: claim.confidence, origin: 'agent', impactLevel: claim.currentMissionImpact, artifactVersionId: version.id }).returning({ id: claims.id });
        if (created) for (const evidenceItemId of claim.evidenceRefs) await tx.insert(claimEvidenceLinks).values({ claimId: created.id, evidenceItemId, weight: 100 }).onConflictDoNothing();
      }
      for (const missing of output.result.missingCapabilities) await tx.insert(claims).values({ tenantId: input.tenantId, missionId: input.missionId, claimType: 'unknown_requirement', statement: missing.questionForUser, valueJson: missing, status: 'unknown', confidence: 0, origin: 'agent', impactLevel: 'high', artifactVersionId: version.id });
      return ok(version.id, { claimCount: output.result.claims.length });
    });
  }); }

  async markMissionAwaitingCapabilityReview(input: Scoped): Promise<void> { return this.idempotentMutation(input, 'markMissionAwaitingCapabilityReview', async (tx) => {
    const [mission] = await tx.select().from(missions).where(and(eq(missions.tenantId, input.tenantId), eq(missions.id, input.missionId))).limit(1);
    if (!mission) throw ApplicationFailure.nonRetryable('Mission not found', 'MISSION_NOT_FOUND');
    const [artifact] = await tx.select().from(artifacts).where(and(eq(artifacts.tenantId, input.tenantId), eq(artifacts.missionId, input.missionId), eq(artifacts.artifactType, 'capability_ledger'))).orderBy(desc(artifacts.updatedAt)).limit(1);
    const [pending] = await tx.select().from(approvals).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.approvalType, 'capability_review'), eq(approvals.status, 'pending'))).limit(1);
    if (!pending) await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, artifactVersionId: artifact?.currentVersionId, approvalType: 'capability_review', status: 'pending' });
    await tx.update(missions).set({ currentStage: 'awaiting_capability_review', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    await this.event(tx, input, 'mission', input.missionId, 'mission.stage_changed.v1', { before: { stage: mission.currentStage }, after: { stage: 'awaiting_capability_review' } });
  }); }

  async recordCapabilityReview(input: Scoped<{ resolvedClaimIds: string[]; decidedByUserId: string; comment?: string; commandId: string }>): Promise<void> { return this.idempotentMutation(input, 'recordCapabilityReview', async (tx) => {
    const highImpact = await tx.select().from(claims).where(and(eq(claims.tenantId, input.tenantId), eq(claims.missionId, input.missionId), eq(claims.impactLevel, 'high'), inArray(claims.status, ['observed', 'inferred', 'user_confirmed', 'contradicted', 'unknown'])));
    const highImpactIds = new Set(highImpact.map((claim) => claim.id));
    const reviewed = new Set(input.resolvedClaimIds.filter((id) => highImpactIds.has(id)));
    const decisionClaimIds = highImpact.filter((claim) => ['user_confirmed', 'contradicted'].includes(claim.status)).map((claim) => claim.id);
    const decisionLinks = decisionClaimIds.length > 0 ? await tx.select().from(claimEvidenceLinks).where(inArray(claimEvidenceLinks.claimId, decisionClaimIds)) : [];
    const supported = new Set(decisionLinks.map((link) => link.claimId));
    const gate = capabilityReviewGate({
      highImpactClaimCount: highImpact.length,
      resolvedHighImpactClaimCount: highImpact.filter((claim) => reviewed.has(claim.id) && ['user_confirmed', 'contradicted', 'unknown'].includes(claim.status)).length,
      confirmedHighImpactClaimCount: highImpact.filter((claim) => claim.status === 'user_confirmed').length,
      unsupportedDecisionCount: decisionClaimIds.filter((id) => !supported.has(id)).length,
    });
    if (!gate.passed) throw ApplicationFailure.nonRetryable('Capability Review Gate failed', 'CAPABILITY_REVIEW_GATE_FAILED', { reasonCodes: gate.reasonCodes });
    const [artifact] = await tx.select().from(artifacts).where(and(eq(artifacts.tenantId, input.tenantId), eq(artifacts.missionId, input.missionId), eq(artifacts.artifactType, 'capability_ledger'))).orderBy(desc(artifacts.updatedAt)).limit(1);
    if (artifact?.currentVersionId) await tx.update(artifactVersions).set({ status: 'accepted', acceptedByUserId: input.decidedByUserId, acceptedAt: new Date() }).where(eq(artifactVersions.id, artifact.currentVersionId));
    await tx.update(approvals).set({ status: 'approved', decidedBy: input.decidedByUserId, decidedAt: new Date(), comment: input.comment }).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.approvalType, 'capability_review'), eq(approvals.status, 'pending')));
    await tx.update(missions).set({ currentStage: 'researching_routes', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    await this.event(tx, input, 'mission', input.missionId, 'mission.capability_review_completed.v1', { after: { resolvedClaimIds: input.resolvedClaimIds, stage: 'researching_routes' }, evidenceRefs: [...new Set(decisionLinks.map((link) => link.evidenceItemId))], metadata: { comment: input.comment ?? '', commandId: input.commandId } });
  }); }

  async researchMarketRoutes(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'researchMarketRoutes', async () => await this.runner.execute<AgentEnvelope<MarketRouteResearchResult>>(await this.task(input, 'market_route_researcher', 'Research market entry routes')), async (output) => {
    return this.read(input, async (tx) => {
      const evidenceRefs = [...new Set(output.result.routes.flatMap((route) => [...route.supportingEvidenceRefs, ...route.counterEvidenceRefs]))];
      const version = await this.artifactInTransaction(tx, input, 'market_route_set', 'Market Route Set', output.result, `${output.result.routes.length} route candidates`, undefined, evidenceRefs);
      for (const route of output.result.routes) {
        const routeEvidenceIds = [...new Set([...route.supportingEvidenceRefs, ...route.counterEvidenceRefs])];
        const evidenceRows = routeEvidenceIds.length > 0 ? await tx.select().from(evidenceItems).where(and(eq(evidenceItems.tenantId, input.tenantId), eq(evidenceItems.missionId, input.missionId), inArray(evidenceItems.id, routeEvidenceIds))) : [];
        const excerptById = new Map(evidenceRows.map((item) => [item.id, item.excerpt]));
        const [created] = await tx.insert(marketRoutes).values({ tenantId: input.tenantId, missionId: input.missionId, routeType: route.routeType, title: route.title, hypothesis: route.hypothesis, applicableScenarios: route.applicableScenarios, keyEntityTypes: route.keyEntityTypes, keyStakeholderRoles: route.keyStakeholderRoles, primaryChannels: route.primaryChannels, capabilityRequirements: route.capabilityRequirements, evidenceSummary: route.supportingEvidenceRefs.map((id) => excerptById.get(id)).filter(Boolean).join(' | '), counterEvidenceSummary: route.counterEvidenceRefs.map((id) => excerptById.get(id)).filter(Boolean).join(' | '), confidence: route.confidence, entryDifficulty: route.entryDifficulty, timeToFirstContactDays: route.timeToFirstContactDays, resourceIntensity: route.resourceIntensity, rank: route.rank, artifactVersionId: version.id }).returning();
        if (created) {
          for (const evidenceItemId of route.supportingEvidenceRefs) await tx.insert(routeEvidenceLinks).values({ tenantId: input.tenantId, missionId: input.missionId, routeId: created.id, evidenceItemId, stance: 'support' }).onConflictDoNothing();
          for (const evidenceItemId of route.counterEvidenceRefs) await tx.insert(routeEvidenceLinks).values({ tenantId: input.tenantId, missionId: input.missionId, routeId: created.id, evidenceItemId, stance: 'oppose' }).onConflictDoNothing();
          await this.event(tx, input, 'market_route', created.id, 'market_route.proposed.v1', { after: created, evidenceRefs: route.supportingEvidenceRefs });
        }
      }
      return ok(version.id, { routeCount: output.result.routes.length });
    });
  }); }

  async researchCompetitors(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'researchCompetitors', async () => await this.runner.execute<AgentEnvelope<CompetitorResult>>(await this.task(input, 'competitor_researcher', 'Research competitors')), async (output) => {
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.competitors.flatMap((item) => item.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'competitor_set', 'Competitor Set', output.result, `${output.result.competitors.length} competitor profiles`, undefined, refs);
      for (const competitor of output.result.competitors) { const entityId = await this.upsertEntity(tx, input, competitor.entityCandidate, 'competitor'); await tx.insert(competitorProfiles).values({ tenantId: input.tenantId, missionId: input.missionId, entityId, marketPresenceSummary: competitor.marketPresenceSummary, routePatterns: competitor.routePatterns, localChannels: competitor.localChannels, exhibitions: competitor.exhibitions, publicCustomers: competitor.publicCustomers, certifications: competitor.certifications, serviceNetwork: competitor.serviceNetwork, marketMinimums: competitor.marketMinimums, opportunityGaps: competitor.opportunityGaps, confidence: competitor.confidence, artifactVersionId: version.id }); }
      return ok(version.id, { competitorCount: output.result.competitors.length });
    });
  }); }

  async researchExpertSignals(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'researchExpertSignals', async () => await this.runner.execute<AgentEnvelope<ExpertResult>>(await this.task(input, 'expert_signal_researcher', 'Research expert and industry signals')), async (output) => {
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.opinions.flatMap((item) => item.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'expert_signal_set', 'Expert Signal Set', output.result, `${output.result.opinions.length} industry opinions`, undefined, refs);
      const [source] = await tx.select().from(sources).where(eq(sources.missionId, input.missionId)).limit(1);
      if (source) for (const opinion of output.result.opinions) await tx.insert(industryOpinions).values({ tenantId: input.tenantId, missionId: input.missionId, sourceId: source.id, topic: opinion.topic, positionSummary: opinion.positionSummary, marketImplication: opinion.marketImplication, credibilityScore: opinion.credibilityScore, commercialInterest: opinion.commercialInterest, contactable: opinion.contactable, artifactVersionId: version.id });
      return ok(version.id, { opinionCount: output.result.opinions.length });
    });
  }); }

  async markMissionAwaitingRouteReview(input: Scoped): Promise<void> { return this.idempotent(input, 'markMissionAwaitingRouteReview', async () => this.read(input, async (tx) => {
    const [mission] = await tx.select().from(missions).where(eq(missions.id, input.missionId)).limit(1);
    await tx.update(missions).set({ currentStage: 'awaiting_route_review', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    const [artifact] = await tx.select().from(artifacts).where(and(eq(artifacts.missionId, input.missionId), eq(artifacts.artifactType, 'market_route_set'))).limit(1);
    if (artifact?.currentVersionId) await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, artifactVersionId: artifact.currentVersionId, approvalType: 'market_route', status: 'pending' }).onConflictDoNothing();
    await this.event(tx, input, 'mission', input.missionId, 'mission.stage_changed.v1', { before: { stage: mission?.currentStage }, after: { stage: 'awaiting_route_review' } });
  })); }

  async recordRouteReview(input: Scoped<{ approvedRouteIds: string[]; acceptedArtifactVersionIds: string[]; decidedByUserId: string; comment?: string; commandId?: string }>): Promise<string[]> { return this.idempotentMutation(input, 'recordRouteReview', async (tx) => {
    const reviewGate = routeReviewGate({ approvedRouteIds: input.approvedRouteIds, acceptedArtifactVersionIds: input.acceptedArtifactVersionIds });
    if (!reviewGate.passed) throw ApplicationFailure.nonRetryable('Route Review Gate failed', 'ROUTE_REVIEW_GATE_FAILED', { reasonCodes: reviewGate.reasonCodes });
    const rows = await tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId)));
    const selected = rows.filter((route) => input.approvedRouteIds.includes(route.id));
    if (selected.length !== new Set(input.approvedRouteIds).size) throw ApplicationFailure.nonRetryable('Selected route is outside this Mission', 'ROUTE_SCOPE_MISMATCH');
    const acceptedIds = new Set(input.acceptedArtifactVersionIds);
    for (const route of selected) {
      const evidenceCount = await tx.select({ value: sql<number>`count(*)::int` }).from(routeEvidenceLinks).where(and(eq(routeEvidenceLinks.routeId, route.id), eq(routeEvidenceLinks.stance, 'support')));
      const gate = routeApprovalGate({ approved: true, evidenceCount: evidenceCount[0]?.value ?? 0, keyEntityTypeCount: route.keyEntityTypes.length, keyStakeholderCount: route.keyStakeholderRoles.length, primaryChannelCount: route.primaryChannels.length, reviewCompleted: acceptedIds.has(route.artifactVersionId) });
      if (!gate.passed) throw ApplicationFailure.nonRetryable(`Route Gate failed for ${route.title}`, 'ROUTE_APPROVAL_GATE_FAILED', { routeId: route.id, reasonCodes: gate.reasonCodes });
    }
    const artifactIds = [...new Set(selected.map((route) => route.artifactVersionId))];
    if (artifactIds.some((id) => !acceptedIds.has(id))) throw ApplicationFailure.nonRetryable('Approved route Artifact Version is not accepted', 'ACCEPTED_ROUTE_ARTIFACT_REQUIRED');
    for (const versionId of artifactIds) {
      const [version] = await tx.select().from(artifactVersions).where(eq(artifactVersions.id, versionId)).limit(1);
      if (!version) throw ApplicationFailure.nonRetryable('Route Artifact Version not found', 'ACCEPTED_ROUTE_ARTIFACT_REQUIRED');
      await tx.update(artifactVersions).set({ status: 'superseded' }).where(and(eq(artifactVersions.artifactId, version.artifactId), eq(artifactVersions.status, 'accepted')));
      await tx.update(artifactVersions).set({ status: 'accepted', acceptedByUserId: input.decidedByUserId, acceptedAt: new Date() }).where(eq(artifactVersions.id, versionId));
      await tx.update(artifacts).set({ currentVersionId: versionId, updatedAt: new Date() }).where(eq(artifacts.id, version.artifactId));
    }
    for (const route of rows) {
      const status = input.approvedRouteIds.includes(route.id) ? 'approved' : 'deprioritized';
      await tx.update(marketRoutes).set({ status, decidedByUserId: input.decidedByUserId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(marketRoutes.id, route.id));
      if (route.status !== status) {
        const links = await tx.select({ evidenceItemId: routeEvidenceLinks.evidenceItemId }).from(routeEvidenceLinks).where(eq(routeEvidenceLinks.routeId, route.id));
        await this.event(tx, input, 'market_route', route.id, status === 'approved' ? 'market_route.approved.v1' : 'market_route.deprioritized.v1', { before: { status: route.status }, after: { status }, evidenceRefs: links.map((link) => link.evidenceItemId), metadata: { comment: input.comment ?? '', commandId: input.commandId ?? input.idempotencyKey } });
      }
    }
    await tx.update(approvals).set({ status: 'approved', decidedBy: input.decidedByUserId, decidedAt: new Date(), comment: input.comment }).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.approvalType, 'market_route'), eq(approvals.status, 'pending')));
    await tx.update(missions).set({ currentStage: 'researching_ecosystem', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    await this.event(tx, input, 'mission', input.missionId, 'mission.route_review_completed.v1', { after: { approvedRouteIds: input.approvedRouteIds, stage: 'researching_ecosystem' }, metadata: { comment: input.comment ?? '', commandId: input.commandId ?? input.idempotencyKey } });
    return input.approvedRouteIds;
  }); }

  async loadApprovedRoutes(input: Scoped): Promise<string[]> { return this.idempotent(input, 'loadApprovedRoutes', async () => this.read(input, async (tx) => (await tx.select({ id: marketRoutes.id }).from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.status, 'approved')))).map((row) => row.id))); }

  private async upsertEntity(tx: DatabaseTransaction, input: ActivityCommandScope, candidate: EntityCandidate, marketRole: string): Promise<string> {
    const [existing] = candidate.website ? await tx.select().from(entities).where(and(eq(entities.tenantId, input.tenantId), eq(entities.website, candidate.website))).limit(1) : [];
    let entityId = existing?.id;
    if (!entityId) { const [created] = await tx.insert(entities).values({ tenantId: input.tenantId, canonicalName: candidate.canonicalName, entityType: candidate.entityType as typeof entities.$inferInsert.entityType, website: candidate.website, countryCode: candidate.countryCode, region: candidate.region, city: candidate.city, description: candidate.description, externalIds: candidate.externalIds }).returning({ id: entities.id }); entityId = created?.id; }
    if (!entityId) throw new Error('Entity insert returned no row');
    await tx.insert(missionEntities).values({ missionId: input.missionId, entityId, marketRoles: [marketRole], relevanceScore: candidate.confidence, discoveryReason: candidate.description ?? 'Agent ecosystem discovery', targetStatus: 'observed' }).onConflictDoUpdate({ target: [missionEntities.missionId, missionEntities.entityId], set: { relevanceScore: candidate.confidence, updatedAt: new Date() } });
    return entityId;
  }

  async discoverEcosystem(input: Scoped<{ routeId: string }>): Promise<ActivityResult> { return this.prepared(input, 'discoverEcosystem', async () => await this.runner.execute<AgentEnvelope<EcosystemResult>>(await this.task(input, 'ecosystem_mapper', `Discover ecosystem for route ${input.routeId}`)), async (output) => {
    return this.read(input, async (tx) => {
      const refs = [...new Set([...output.result.entities.flatMap((item) => item.evidenceRefs), ...output.result.relationships.flatMap((item) => item.evidenceRefs)])];
      const version = await this.artifactInTransaction(tx, input, 'ecosystem_map', 'Ecosystem Map', output.result, `${output.result.entities.length} entities`, undefined, refs);
      const entityIds = new Map<string, string>();
      for (const candidate of output.result.entities) entityIds.set(candidate.candidateKey, await this.upsertEntity(tx, input, candidate, 'ecosystem_member'));
      for (const relation of output.result.relationships) { const sourceEntityId = entityIds.get(relation.sourceCandidateKey); const targetEntityId = entityIds.get(relation.targetCandidateKey); if (sourceEntityId && targetEntityId) await tx.insert(entityRelationships).values({ tenantId: input.tenantId, missionId: input.missionId, sourceEntityId, targetEntityId, relationshipType: relation.relationshipType, directionality: 'directed', confidence: relation.confidence, attributes: { evidenceRefs: relation.evidenceRefs } }); }
      return ok(version.id, { entityCount: output.result.entities.length });
    });
  }); }

  async resolveEntities(input: Scoped): Promise<ActivityResult> { return this.prepared(input, 'resolveEntities', async () => {
    const rows = await this.read(input, async (tx) => tx.select({ entity: entities }).from(missionEntities).innerJoin(entities, eq(entities.id, missionEntities.entityId)).where(and(eq(entities.tenantId, input.tenantId), eq(missionEntities.missionId, input.missionId))));
    const decisions: Array<{ entityId: string; result: EntityResolutionResult }> = [];
    for (const row of rows) { const output = await this.runner.execute<AgentEnvelope<EntityResolutionResult>>(await this.task(input, 'entity_resolver', `Resolve entity identity for ${row.entity.canonicalName}`)); decisions.push({ entityId: row.entity.id, result: output.result }); }
    return decisions;
  }, async (decisions) => {
    return this.read(input, async (tx) => { const refs = [...new Set(decisions.flatMap((item) => item.result.evidenceRefs))]; const version = await this.artifactInTransaction(tx, input, 'ecosystem_map', 'Entity Resolution Decisions', { decisions }, `${decisions.length} entity identities resolved`, undefined, refs); return ok(version.id, { resolvedCount: decisions.length }); });
  }); }

  async rankTargets(input: Scoped): Promise<string[]> { return this.prepared(input, 'rankTargets', async () => await this.runner.execute<AgentEnvelope<TargetRankingResult>>(await this.task(input, 'target_ranker', 'Rank evidence-backed target organizations for business review')), async (output) => {
    return this.read(input, async (tx) => {
      await tx.update(missions).set({ currentStage: 'researching_targets', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      const [entityRows, routeRows] = await Promise.all([
        tx.select({ entity: entities, mission: missionEntities }).from(missionEntities).innerJoin(entities, eq(entities.id, missionEntities.entityId)).where(and(eq(entities.tenantId, input.tenantId), eq(missionEntities.missionId, input.missionId))),
        tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.status, 'approved'))),
      ]);
      const ranked = [...output.result.targets].sort((a, b) => b.finalScore - a.finalScore).slice(0, 20);
      const evidenceRefs = [...new Set(ranked.flatMap((target) => target.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'target_ranking', 'Target Ranking', { targets: ranked }, `${ranked.length} researched target candidates`, undefined, evidenceRefs);
      const qualified: Array<{ entityId: string; score: number }> = [];
      for (const [index, target] of ranked.entries()) {
        const targetWebsite = normalizedWebsite(target.website);
        const entityRow = entityRows.find((row) => {
          const website = normalizedWebsite(row.entity.website);
          return (targetWebsite && website === targetWebsite) || row.entity.canonicalName.trim().toLowerCase() === target.organizationName.trim().toLowerCase();
        });
        const route = routeRows.find((item) => item.title.trim().toLowerCase() === target.primaryRouteTitle.trim().toLowerCase());
        if (!entityRow || !route) throw new ExecutionError('OUTPUT_INVALID', 'Ranked target is not a known organization on an approved route');
        const mission = await this.mission(input);
        if (!withinResearchRegions(normalizeResearchDefinition(mission), entityRow.entity)) throw new ExecutionError('EVIDENCE_INVALID', 'Target geography does not satisfy the structured research boundary');
        const gate = targetGate({ entityResolved: true, hasOfficialIdentity: Boolean(entityRow.entity.website || Object.keys(entityRow.entity.externalIds ?? {}).length > 0), marketRoleKnown: target.marketRole.trim().length > 0, linkedToApprovedRoute: route.status === 'approved', productFit: target.productFit, evidenceQuality: target.evidenceQuality });
        const [assessment] = await tx.insert(targetAssessments).values({ tenantId: input.tenantId, missionId: input.missionId, entityId: entityRow.entity.id, routeId: route.id, rank: index + 1, marketRole: target.marketRole, productFit: target.productFit, routeFit: target.routeFit, demandSignal: target.demandSignal, contactability: target.contactability, evidenceQuality: target.evidenceQuality, finalScore: target.finalScore, rationale: target.rationale, gatePassed: gate.passed, artifactVersionId: version.id }).onConflictDoUpdate({ target: [targetAssessments.missionId, targetAssessments.entityId, targetAssessments.routeId], set: { rank: index + 1, marketRole: target.marketRole, productFit: target.productFit, routeFit: target.routeFit, demandSignal: target.demandSignal, contactability: target.contactability, evidenceQuality: target.evidenceQuality, finalScore: target.finalScore, rationale: target.rationale, gatePassed: gate.passed, artifactVersionId: version.id, updatedAt: new Date() } }).returning();
        if (!assessment) continue;
        for (const evidenceItemId of target.evidenceRefs) await tx.insert(targetAssessmentEvidenceLinks).values({ targetAssessmentId: assessment.id, evidenceItemId }).onConflictDoNothing();
        await tx.update(missionEntities).set({ marketRoles: [...new Set([...entityRow.mission.marketRoles, target.marketRole])], relevanceScore: target.finalScore, primaryRouteId: route.id, targetStatus: gate.passed ? 'target' : 'observed', discoveryReason: target.rationale, updatedAt: new Date() }).where(and(eq(missionEntities.missionId, input.missionId), eq(missionEntities.entityId, entityRow.entity.id)));
        await this.event(tx, input, 'entity', entityRow.entity.id, 'target.assessed.v1', { after: { rank: index + 1, gatePassed: gate.passed, scores: { productFit: target.productFit, routeFit: target.routeFit, demandSignal: target.demandSignal, contactability: target.contactability, evidenceQuality: target.evidenceQuality, finalScore: target.finalScore } }, evidenceRefs: target.evidenceRefs });
        if (gate.passed) qualified.push({ entityId: entityRow.entity.id, score: target.finalScore });
      }
      return qualified.sort((a, b) => b.score - a.score).slice(0, 10).map((target) => target.entityId);
    });
  }); }

  async markMissionAwaitingTargetReview(input: Scoped<{ candidateTargetIds: string[] }>): Promise<void> { return this.idempotentMutation(input, 'markMissionAwaitingTargetReview', async (tx) => {
    const [mission] = await tx.select().from(missions).where(and(eq(missions.tenantId, input.tenantId), eq(missions.id, input.missionId))).limit(1);
    if (!mission) throw ApplicationFailure.nonRetryable('Mission not found', 'MISSION_NOT_FOUND');
    const [artifact] = await tx.select().from(artifacts).where(and(eq(artifacts.tenantId, input.tenantId), eq(artifacts.missionId, input.missionId), eq(artifacts.artifactType, 'target_ranking'))).orderBy(desc(artifacts.updatedAt)).limit(1);
    const [pending] = await tx.select().from(approvals).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.approvalType, 'target_review'), eq(approvals.status, 'pending'))).limit(1);
    if (!pending) await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, artifactVersionId: artifact?.currentVersionId, approvalType: 'target_review', status: 'pending' });
    await tx.update(missions).set({ currentStage: 'awaiting_target_review', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    await this.event(tx, input, 'mission', input.missionId, 'mission.stage_changed.v1', { before: { stage: mission.currentStage }, after: { stage: 'awaiting_target_review', candidateTargetCount: input.candidateTargetIds.length } });
  }); }

  async recordTargetReview(input: Scoped<{ selectedTargetIds: string[]; decidedByUserId: string; comment?: string; commandId: string }>): Promise<Array<{ organizationId: string; routeId: string }>> { return this.idempotentMutation(input, 'recordTargetReview', async (tx) => {
    const selectedIds = [...new Set(input.selectedTargetIds)];
    if (selectedIds.length < 1 || selectedIds.length > 3) throw ApplicationFailure.nonRetryable('Select one to three target organizations', 'TARGET_SELECTION_INVALID');
    const assessments = await tx.select().from(targetAssessments).where(and(eq(targetAssessments.tenantId, input.tenantId), eq(targetAssessments.missionId, input.missionId), inArray(targetAssessments.entityId, selectedIds), eq(targetAssessments.gatePassed, true)));
    const currentByEntity = new Map<string, (typeof assessments)[number]>();
    for (const assessment of assessments.sort((a, b) => a.rank - b.rank)) if (!currentByEntity.has(assessment.entityId)) currentByEntity.set(assessment.entityId, assessment);
    if (currentByEntity.size !== selectedIds.length) throw ApplicationFailure.nonRetryable('Every selected target must pass Target Gate', 'TARGET_GATE_FAILED');
    const candidateRows = await tx.select({ entityId: targetAssessments.entityId }).from(targetAssessments).where(and(eq(targetAssessments.tenantId, input.tenantId), eq(targetAssessments.missionId, input.missionId), eq(targetAssessments.gatePassed, true), sql`${targetAssessments.rank} <= 10`));
    const candidateIds = [...new Set(candidateRows.map((row) => row.entityId))];
    if (selectedIds.some((id) => !candidateIds.includes(id))) throw ApplicationFailure.nonRetryable('Selected target is outside the current top-ten candidate set', 'TARGET_SCOPE_MISMATCH');
    if (candidateIds.length > 0) await tx.update(missionEntities).set({ targetStatus: 'target', updatedAt: new Date() }).where(and(eq(missionEntities.missionId, input.missionId), inArray(missionEntities.entityId, candidateIds)));
    await tx.update(missionEntities).set({ targetStatus: 'high_priority', updatedAt: new Date() }).where(and(eq(missionEntities.missionId, input.missionId), inArray(missionEntities.entityId, selectedIds)));
    for (const organizationId of selectedIds) {
      const assessment = currentByEntity.get(organizationId)!;
      const links = await tx.select({ evidenceItemId: targetAssessmentEvidenceLinks.evidenceItemId }).from(targetAssessmentEvidenceLinks).where(eq(targetAssessmentEvidenceLinks.targetAssessmentId, assessment.id));
      await this.event(tx, input, 'entity', organizationId, 'target.selected.v1', { after: { targetStatus: 'high_priority', routeId: assessment.routeId, rank: assessment.rank }, evidenceRefs: links.map((link) => link.evidenceItemId), metadata: { comment: input.comment ?? '', commandId: input.commandId } });
    }
    await tx.update(approvals).set({ status: 'approved', decidedBy: input.decidedByUserId, decidedAt: new Date(), comment: input.comment }).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.approvalType, 'target_review'), eq(approvals.status, 'pending')));
    await tx.update(missions).set({ currentStage: 'researching_contacts', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    await this.event(tx, input, 'mission', input.missionId, 'mission.target_review_completed.v1', { after: { selectedTargetIds: selectedIds, stage: 'researching_contacts' }, metadata: { comment: input.comment ?? '', commandId: input.commandId } });
    return selectedIds.map((organizationId) => ({ organizationId, routeId: currentByEntity.get(organizationId)!.routeId }));
  }); }

  async createOpportunity(input: Scoped<{ organizationId: string; routeId: string }>): Promise<string> { return this.idempotent(input, 'createOpportunity', async () => this.read(input, async (tx) => {
    const [existing] = await tx.select().from(opportunities).where(and(eq(opportunities.tenantId, input.tenantId), eq(opportunities.missionId, input.missionId), eq(opportunities.organizationId, input.organizationId), eq(opportunities.routeId, input.routeId))).limit(1);
    if (existing) return existing.id;
    const [route] = await tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.id, input.routeId), eq(marketRoutes.status, 'approved'))).limit(1);
    if (!route) throw ApplicationFailure.nonRetryable('No approved route available', 'ROUTE_APPROVAL_REQUIRED');
    const [entity] = await tx.select().from(entities).where(and(eq(entities.tenantId, input.tenantId), eq(entities.id, input.organizationId))).limit(1);
    if (!entity) throw ApplicationFailure.nonRetryable('Entity not found', 'ENTITY_NOT_FOUND');
    const [created] = await tx.insert(opportunities).values({ tenantId: input.tenantId, missionId: input.missionId, organizationId: input.organizationId, routeId: route.id, title: `${entity.canonicalName} opportunity`, hypothesis: 'Organization fits the approved route and requires stakeholder/contact validation.', status: 'target_identified', nextAction: 'Map stakeholders' }).returning();
    if (!created) throw new Error('Opportunity insert returned no row');
    const [assessment] = await tx.select().from(targetAssessments).where(and(eq(targetAssessments.tenantId, input.tenantId), eq(targetAssessments.missionId, input.missionId), eq(targetAssessments.entityId, input.organizationId), eq(targetAssessments.routeId, route.id), eq(targetAssessments.gatePassed, true))).limit(1);
    const links = assessment ? await tx.select({ evidenceItemId: targetAssessmentEvidenceLinks.evidenceItemId }).from(targetAssessmentEvidenceLinks).where(eq(targetAssessmentEvidenceLinks.targetAssessmentId, assessment.id)) : [];
    await this.event(tx, input, 'opportunity', created.id, 'opportunity.created.v1', { after: created, evidenceRefs: links.map((link) => link.evidenceItemId), opportunityId: created.id });
    return created.id;
  })); }

  async recordChildWorkflow(input: Scoped<{ opportunityId: string; workflowId: string }>): Promise<void> { return this.idempotent(input, 'recordChildWorkflow', async () => this.read(input, async (tx) => { await tx.insert(workflowInstances).values({ tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, workflowType: 'opportunity', workflowId: input.workflowId, runId: input.workflowId, status: 'running' }).onConflictDoUpdate({ target: workflowInstances.workflowId, set: { status: 'running', updatedAt: new Date() } }); })); }

  private async updateMissionState(input: Scoped, activityType: string, values: Partial<typeof missions.$inferInsert>, eventType: string): Promise<void> { return this.idempotent(input, activityType, async () => this.read(input, async (tx) => {
    const [before] = await tx.select().from(missions).where(eq(missions.id, input.missionId)).limit(1);
    if (!before) throw ApplicationFailure.nonRetryable('Mission not found', 'MISSION_NOT_FOUND');
    const unchanged = Object.entries(values).every(([key, value]) => {
      const current = before[key as keyof typeof before];
      if (value instanceof Date && current instanceof Date) return value.getTime() === current.getTime();
      return current === value;
    });
    const terminalCompletionAlreadyPersisted = values.status === 'completed' && values.currentStage === 'completed' && before.status === 'completed' && before.currentStage === 'completed';
    if (unchanged || terminalCompletionAlreadyPersisted) return;
    await tx.update(missions).set({ ...values, updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    await this.event(tx, input, 'mission', input.missionId, eventType, { before, after: values });
  })); }
  async markMissionActive(input: Scoped): Promise<void> { return this.updateMissionState(input, 'markMissionActive', { currentStage: 'active', status: 'running' }, 'mission.activated.v1'); }
  async markMissionAwaitingActionReview(input: Scoped): Promise<void> { return this.updateMissionState(input, 'markMissionAwaitingActionReview', { currentStage: 'awaiting_action_review', status: 'running' }, 'mission.action_review_requested.v1'); }
  async markMissionCompleted(input: Scoped): Promise<void> { return this.updateMissionState(input, 'markMissionCompleted', { currentStage: 'completed', status: 'completed', completedAt: new Date() }, 'mission.completed.v1'); }
  async setMissionPaused(input: Scoped<{ paused: boolean; reason?: string }>): Promise<void> { return this.updateMissionState(input, 'setMissionPaused', { status: input.paused ? 'paused' : 'running' }, input.paused ? 'mission.paused.v1' : 'mission.resumed.v1'); }
  async updateMissionBudget(input: Scoped<{ budget: BudgetConfig }>): Promise<void> { return this.updateMissionState(input, 'updateMissionBudget', { budgetConfig: input.budget }, 'mission.budget_updated.v1'); }
  async createRefreshSchedule(input: Scoped): Promise<void> { return this.idempotent(input, 'createRefreshSchedule', async () => { await this.temporal.createWeeklyRefreshSchedule(input.tenantId, input.missionId); }); }

  async loadOpportunity(input: Scoped<{ opportunityId: string }>) { return this.idempotent(input, 'loadOpportunity', async () => { const row = await this.opportunity(input); return { id: row.id, status: row.status }; }); }
  async resolveEntity(input: Scoped<{ opportunityId: string }>): Promise<ActivityResult> { return this.idempotent(input, 'resolveEntity', async () => { const row = await this.opportunity(input); return ok(row.organizationId, { decision: 'resolved' }); }); }

  private async transition(tx: DatabaseTransaction, input: Scoped<{ opportunityId: string }>, to: OpportunityStatus, trigger: Parameters<typeof transitionOpportunity>[0]['trigger'], evidenceRefs: string[], interactionId?: string): Promise<void> {
    await tx.execute(sql`select id from opportunities where id=${input.opportunityId} for update`);
    const [current] = await tx.select().from(opportunities).where(and(eq(opportunities.tenantId, input.tenantId), eq(opportunities.missionId, input.missionId), eq(opportunities.id, input.opportunityId))).limit(1);
    if (!current) throw ApplicationFailure.nonRetryable('Opportunity not found', 'OPPORTUNITY_NOT_FOUND');
    if (current.status === to) return;
    transitionOpportunity({ tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, expectedFrom: current.status, to, trigger, evidenceRefs, ...(interactionId ? { interactionId } : {}), actor: input.requestedBy ?? { type: 'system', id: 'temporal-worker' }, correlationId: input.correlationId, ...(input.causationId ? { causationId: input.causationId } : {}) });
    await tx.update(opportunities).set({ status: to, updatedAt: new Date() }).where(eq(opportunities.id, input.opportunityId));
    await this.event(tx, input, 'opportunity', input.opportunityId, 'opportunity.state_transitioned.v1', { before: { status: current.status }, after: { status: to, trigger }, evidenceRefs, opportunityId: input.opportunityId });
  }

  async mapStakeholders(input: Scoped<{ opportunityId: string }>): Promise<ActivityResult> { return this.prepared(input, 'mapStakeholders', async () => {
    const opportunity = await this.opportunity(input);
    const output = await this.runner.execute<AgentEnvelope<StakeholderResult>>(await this.task(input, 'stakeholder_mapper', 'Map decision stakeholders'));
    return { opportunity, output };
  }, async ({ opportunity, output }) => {
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.stakeholders.flatMap((item) => item.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'stakeholder_map', 'Stakeholder Map', output.result, `${output.result.stakeholders.length} stakeholders`, input.opportunityId, refs);
      for (const item of output.result.stakeholders) { const [stakeholder] = await tx.insert(stakeholderRoles).values({ tenantId: input.tenantId, missionId: input.missionId, organizationId: opportunity.organizationId, roleType: item.roleType, title: item.title, decisionInfluence: item.decisionInfluence, contactPriority: item.contactPriority, relevanceReason: item.relevanceReason, confidence: item.confidence }).returning(); if (stakeholder) await tx.insert(opportunityStakeholders).values({ opportunityId: input.opportunityId, stakeholderRoleId: stakeholder.id, roleInOpportunity: item.roleType, rank: item.contactPriority }).onConflictDoNothing(); }
      await this.transition(tx, input, 'stakeholder_mapped', 'stakeholder_mapping_completed', refs);
      return ok(version.id, { stakeholderCount: output.result.stakeholders.length });
    });
  }); }

  async findContactPaths(input: Scoped<{ opportunityId: string }>): Promise<string[]> { return this.prepared(input, 'findContactPaths', async () => {
    const opportunity = await this.opportunity(input);
    const output = await this.runner.execute<AgentEnvelope<ContactResult>>(await this.task(input, 'contact_path_finder', 'Find public contact paths'));
    return { opportunity, output };
  }, async ({ opportunity, output }) => {
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.contactPoints.flatMap((item) => [...item.contactEvidenceRefs, ...item.employmentEvidenceRefs]))];
      const version = await this.artifactInTransaction(tx, input, 'contact_path_set', 'Contact Path Set', output.result, `${output.result.contactPoints.length} public paths`, input.opportunityId, refs);
      const ids: string[] = [];
      const stakeholderRows = await tx.select({ link: opportunityStakeholders, stakeholder: stakeholderRoles }).from(opportunityStakeholders).innerJoin(stakeholderRoles, eq(stakeholderRoles.id, opportunityStakeholders.stakeholderRoleId)).where(eq(opportunityStakeholders.opportunityId, input.opportunityId)).orderBy(asc(opportunityStakeholders.rank));
      const [organization] = await tx.select().from(entities).where(and(eq(entities.tenantId, input.tenantId), eq(entities.id, opportunity.organizationId))).limit(1);
      const officialHost = sourceHost(organization?.website);
      for (const item of output.result.contactPoints) {
        const evidenceRows = await tx.select({ evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(evidenceItems).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(evidenceItems.tenantId, input.tenantId), eq(evidenceItems.missionId, input.missionId), inArray(evidenceItems.id, [...new Set([...item.contactEvidenceRefs, ...item.employmentEvidenceRefs])])));
        const primaryEvidence = evidenceRows.find((row) => item.contactEvidenceRefs.includes(row.evidence.id));
        if (!primaryEvidence) throw ApplicationFailure.nonRetryable('Contact candidate evidence is not persisted', 'CONTACT_EVIDENCE_MISSING');
        if (!item.isPublic || !item.contactEvidenceRefs.some(id => evidenceRows.some(row => row.evidence.id === id && contactContentSupports(item.value, row.evidence.excerpt, row.source.normalizedUrl ?? undefined)))) throw new ExecutionError('EVIDENCE_INVALID', 'Public contact value is not present in cited excerpt');
        const stakeholder = stakeholderRows.find((row) => row.stakeholder.roleType === item.stakeholderRoleType) ?? stakeholderRows[0];
        const [contact] = await tx.insert(contactPoints).values({ tenantId: input.tenantId, missionId: input.missionId, organizationId: opportunity.organizationId, stakeholderRoleId: stakeholder?.stakeholder.id, contactType: item.contactType, value: item.value, normalizedValue: item.normalizedValue, label: item.label ?? item.personName, isPublic: item.isPublic, sourceId: primaryEvidence.source.id, sourceLocator: primaryEvidence.evidence.locator, confidence: item.confidence, preferredRank: item.recommendedRank, language: item.language, timezone: item.timezone, metadata: { artifactVersionId: version.id, personName: item.personName } }).onConflictDoUpdate({ target: [contactPoints.missionId, contactPoints.contactType, contactPoints.normalizedValue], set: { confidence: item.confidence, stakeholderRoleId: stakeholder?.stakeholder.id, updatedAt: new Date() } }).returning();
        if (!contact) continue;
        ids.push(contact.id);
        await tx.insert(opportunityContacts).values({ opportunityId: input.opportunityId, contactPointId: contact.id, usageType: item.recommendedRank === 1 ? 'primary' : 'backup', rank: item.recommendedRank }).onConflictDoNothing();
        for (const [index, evidenceItemId] of item.contactEvidenceRefs.entries()) { const row = evidenceRows.find((candidate) => candidate.evidence.id === evidenceItemId); const group = sourceHost(row?.source.normalizedUrl) ?? item.independentGroupKeys[index] ?? row?.source.id ?? primaryEvidence.source.id; const authority = officialHost && group === officialHost ? 'official_organization' : typeof row?.source.metadata.authority === 'string' ? row.source.metadata.authority : 'general_public_web'; await tx.insert(contactPointEvidenceLinks).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, evidenceItemId, relationType: index === 0 ? 'direct_listing' : 'corroboration', sourceAuthority: authority, independentGroupKey: group, supportsValue: Boolean(row && contactContentSupports(item.value, row.evidence.excerpt, row.source.normalizedUrl ?? undefined)), observedAt: row?.snapshot.fetchedAt ?? primaryEvidence.snapshot.fetchedAt }).onConflictDoNothing(); }
        for (const [index, evidenceItemId] of item.employmentEvidenceRefs.entries()) { const row = evidenceRows.find((candidate) => candidate.evidence.id === evidenceItemId); const group = sourceHost(row?.source.normalizedUrl) ?? item.independentGroupKeys[index] ?? row?.source.id ?? primaryEvidence.source.id; const authority = officialHost && group === officialHost ? 'official_organization' : typeof row?.source.metadata.authority === 'string' ? row.source.metadata.authority : 'general_public_web'; await tx.insert(contactPointEvidenceLinks).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, evidenceItemId, relationType: 'employment_confirmation', sourceAuthority: authority, independentGroupKey: group, supportsEmployment: true, observedAt: row?.snapshot.fetchedAt ?? primaryEvidence.snapshot.fetchedAt }).onConflictDoNothing(); }
        await this.event(tx, input, 'contact_point', contact.id, 'contact_point.discovered.v1', { after: { contactType: contact.contactType, normalizedValue: contact.normalizedValue }, evidenceRefs: item.contactEvidenceRefs, opportunityId: input.opportunityId });
        await this.event(tx, input, 'contact_point', contact.id, 'contact_point.evidence_linked.v1', { evidenceRefs: [...item.contactEvidenceRefs, ...item.employmentEvidenceRefs], opportunityId: input.opportunityId });
      }
      if (ids.length > 0 && refs.length > 0) await this.transition(tx, input, 'contact_path_found', 'contact_discovered', refs);
      else await this.event(tx, input, 'opportunity', input.opportunityId, 'contact_path.research_required.v1', { after: { reason: 'No evidence-backed public contact path was found' }, evidenceRefs: refs, opportunityId: input.opportunityId });
      return ids;
    });
  }); }

  async verifyContactPoint(input: Scoped<{ opportunityId: string; contactPointId: string }>): Promise<ActivityResult> { return this.prepared(input, 'verifyContactPoint', async () => {
    const contact = await this.read(input, async (tx) => (await tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, input.tenantId), eq(contactPoints.missionId, input.missionId), eq(contactPoints.id, input.contactPointId))).limit(1))[0]);
    if (!contact) throw ApplicationFailure.nonRetryable('Contact not found', 'CONTACT_NOT_FOUND');
    const links = await this.read(input, async (tx) => tx.select().from(contactPointEvidenceLinks).where(eq(contactPointEvidenceLinks.contactPointId, contact.id)));
    const connector = this.connectors.get('contact_verification');
    const exact = links.find((link) => link.relationType === 'direct_listing' && link.sourceAuthority === 'official_organization');
    const result = connector ? await connector.execute({ tenantId: input.tenantId, missionId: input.missionId, operation: contact.contactType.includes('email') ? 'validate_mx' : 'validate_url', ...(contact.contactType.includes('email') ? {} : { url: contact.value }), options: { value: contact.value, officialSource: Boolean(exact), exactValueLocatorEvidenceId: exact?.evidenceItemId, independentConfirmationGroups: [...new Set(links.filter((link) => link.relationType === 'corroboration').map((link) => link.independentGroupKey))], employmentConfirmationEvidenceIds: links.filter((link) => link.supportsEmployment).map((link) => link.evidenceItemId) } }) : undefined;
    const score = Number(result?.items[0]?.metadata.score ?? contact.confidence);
    const facts = (result?.items[0]?.metadata.facts ?? { formatCheckPassed: true, exactValueListedByOfficialOrganization: Boolean(exact), ...(exact ? { exactValueLocatorEvidenceId: exact.evidenceItemId } : {}), independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] }) as ContactVerificationFacts;
    const status = deriveContactVerificationStatus(facts);
    return { contact, links, score, facts, status, result };
  }, async ({ contact, links, score, facts, status, result }) => {
    return this.read(input, async (tx) => {
      const [verification] = await tx.insert(contactVerifications).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, method: contact.contactType.includes('email') ? 'mx' : 'url_access', result: ['source_confirmed','cross_confirmed','manually_confirmed'].includes(status) ? 'passed' : 'partial', score, details: result?.items[0]?.metadata ?? {}, verificationStatusBefore: contact.verificationStatus, verificationStatusAfter: status, facts }).returning();
      if (!verification) throw new Error('Contact verification insert returned no row');
      for (const link of links) await tx.insert(contactVerificationEvidenceLinks).values({ contactVerificationId: verification.id, evidenceItemId: link.evidenceItemId, purpose: link.relationType }).onConflictDoNothing();
      await tx.update(contactPoints).set({ verificationStatus: status, confidence: score, lastVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(contactPoints.id, contact.id));
      await this.event(tx, input, 'contact_point', contact.id, 'contact_point.verification_completed.v1', { before: { status: contact.verificationStatus }, after: { status, facts }, evidenceRefs: links.map((link) => link.evidenceItemId), opportunityId: input.opportunityId });
      const [opportunity] = await tx.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).limit(1);
      if (opportunity?.status === 'contact_path_found' && ['source_confirmed','cross_confirmed','manually_confirmed'].includes(status)) await this.transition(tx, input, 'contact_path_verified', 'contact_verified', links.map((link) => link.evidenceItemId));
      return ok(contact.id, { score, status });
    });
  }); }

  async evaluateContactPath(input: Scoped<{ opportunityId: string }>): Promise<{ verified: boolean; evidenceRefs: string[] }> { return this.idempotent(input, 'evaluateContactPath', async () => this.read(input, async (tx) => {
    const rows = await tx.select({ contact: contactPoints, evidenceItemId: contactPointEvidenceLinks.evidenceItemId }).from(opportunityContacts).innerJoin(contactPoints, eq(contactPoints.id, opportunityContacts.contactPointId)).leftJoin(contactPointEvidenceLinks, eq(contactPointEvidenceLinks.contactPointId, contactPoints.id)).where(and(eq(opportunityContacts.opportunityId, input.opportunityId), inArray(contactPoints.verificationStatus, ['source_confirmed', 'cross_confirmed', 'manually_confirmed'])));
    const evidenceRefs = [...new Set(rows.map((row) => row.evidenceItemId).filter((id): id is string => Boolean(id)))];
    return { verified: rows.length > 0 && evidenceRefs.length > 0, evidenceRefs };
  })); }

  async qualifyOpportunity(input: Scoped<{ opportunityId: string }>): Promise<{ score: number; status: OpportunityStatus; unknowns: string[] }> { return this.prepared(input, 'qualifyOpportunity', async () => await this.runner.execute<AgentEnvelope<QualificationResult>>(await this.task(input, 'opportunity_qualifier', 'Qualify and score opportunity')), async (output) => {
    const result = output.result;
    const opportunity = await this.opportunity(input);
    const executionState = opportunity.status === 'contact_path_verified' ? 'contact_verified' : opportunity.status === 'contact_path_found' ? 'contact_found' : opportunity.status === 'stakeholder_mapped' ? 'stakeholder_mapped' : 'target_only';
    const calculated = scoreOpportunity(result.scores, result.scores.evidenceQuality >= 70 ? 'high' : result.scores.evidenceQuality >= 40 ? 'medium' : 'low', executionState, result.commercialValueBand, { salesHours: result.estimatedSalesHours, technicalHours: result.estimatedTechnicalHours, marketCostPoints: result.estimatedMarketCostPoints, sampleCostPoints: 0, travelCostPoints: 0 });
    return this.read(input, async (tx) => {
      const [last] = await tx.select({ versionNo: opportunityScores.versionNo }).from(opportunityScores).where(eq(opportunityScores.opportunityId, input.opportunityId)).orderBy(desc(opportunityScores.versionNo)).limit(1);
      await tx.insert(opportunityScores).values({ opportunityId: input.opportunityId, versionNo: (last?.versionNo ?? 0) + 1, ...result.scores, baseScore: String(calculated.baseScore), finalScore: calculated.finalScore, rationale: result.rationale, generatedBy: 'agent' });
      await tx.update(opportunities).set({ hypothesis: result.hypothesis, score: calculated.finalScore, evidenceConfidence: result.scores.evidenceQuality >= 70 ? 'high' : result.scores.evidenceQuality >= 40 ? 'medium' : 'low', commercialValueBand: result.commercialValueBand, estimatedSalesHours: String(result.estimatedSalesHours), estimatedTechnicalHours: String(result.estimatedTechnicalHours), estimatedMarketCostPoints: String(result.estimatedMarketCostPoints), resourceEfficiency: String(calculated.resourceEfficiency), nextAction: result.nextAction, updatedAt: new Date() }).where(eq(opportunities.id, input.opportunityId));
      await this.artifactInTransaction(tx, input, 'opportunity_qualification', 'Opportunity Qualification', result, `Opportunity score ${calculated.finalScore}`, input.opportunityId, result.evidenceRefs);
      await this.event(tx, input, 'opportunity', input.opportunityId, 'opportunity.scored.v1', { after: { score: calculated.finalScore, dimensions: result.scores }, evidenceRefs: result.evidenceRefs, opportunityId: input.opportunityId });
      return { score: calculated.finalScore, status: opportunity.status, unknowns: result.unknowns };
    });
  }); }

  async buildActionCard(input: Scoped<{ opportunityId: string; basedOnVersionNo?: number; feedbackRefs?: string[]; feedbackComment?: string }>): Promise<{ actionCardId: string; versionNo: number; cardType: 'outreach' | 'research' }> { return this.prepared(input, 'buildActionCard', async () => await this.runner.execute<AgentEnvelope<ActionCardResult>>(await this.task(input, 'action_card_builder', input.feedbackComment ? `Revise action card using feedback: ${input.feedbackComment}` : 'Build executable action card')), async (output) => {
    return this.read(input, async (tx) => {
      await tx.execute(sql`select id from opportunities where id=${input.opportunityId} for update`);
      const [opportunity] = await tx.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).limit(1);
      const [stakeholder] = await tx.select({ link: opportunityStakeholders, stakeholder: stakeholderRoles }).from(opportunityStakeholders).innerJoin(stakeholderRoles, eq(stakeholderRoles.id, opportunityStakeholders.stakeholderRoleId)).where(eq(opportunityStakeholders.opportunityId, input.opportunityId)).orderBy(asc(opportunityStakeholders.rank)).limit(1);
      const contacts = await tx.select({ link: opportunityContacts, contact: contactPoints }).from(opportunityContacts).innerJoin(contactPoints, eq(contactPoints.id, opportunityContacts.contactPointId)).where(eq(opportunityContacts.opportunityId, input.opportunityId)).orderBy(asc(opportunityContacts.rank));
      if (!opportunity || !stakeholder) throw ApplicationFailure.nonRetryable('Action Card stakeholder prerequisite is missing', 'ACTION_CARD_GATE_FAILED');
      const verifiedContacts = contacts.filter((row) => ['source_confirmed', 'cross_confirmed', 'manually_confirmed'].includes(row.contact.verificationStatus));
      const primary = verifiedContacts[0];
      const backup = verifiedContacts[1];
      const cardType = primary ? 'outreach' as const : 'research' as const;
      const targetRoleLabel = stakeholder.stakeholder.title ?? stakeholder.stakeholder.roleType;
      const unknowns = cardType === 'research' && output.result.unknowns.length === 0 ? ['The correct public contact path is not yet verified'] : output.result.unknowns;
      const [routeLinks, targetAssessment] = await Promise.all([
        tx.select({ evidenceItemId: routeEvidenceLinks.evidenceItemId }).from(routeEvidenceLinks).where(and(eq(routeEvidenceLinks.routeId, opportunity.routeId), eq(routeEvidenceLinks.stance, 'support'))),
        tx.select({ id: targetAssessments.id }).from(targetAssessments).where(and(eq(targetAssessments.missionId, input.missionId), eq(targetAssessments.entityId, opportunity.organizationId), eq(targetAssessments.routeId, opportunity.routeId), eq(targetAssessments.gatePassed, true))).limit(1).then((rows) => rows[0]),
      ]);
      const [targetLinks, contactLinks] = await Promise.all([
        targetAssessment ? tx.select({ evidenceItemId: targetAssessmentEvidenceLinks.evidenceItemId }).from(targetAssessmentEvidenceLinks).where(eq(targetAssessmentEvidenceLinks.targetAssessmentId, targetAssessment.id)) : Promise.resolve([]),
        primary ? tx.select({ evidenceItemId: contactPointEvidenceLinks.evidenceItemId }).from(contactPointEvidenceLinks).where(and(eq(contactPointEvidenceLinks.contactPointId, primary.contact.id), eq(contactPointEvidenceLinks.supportsValue, true))) : Promise.resolve([]),
      ]);
      const boundEvidenceRefs = [...new Set([...output.result.evidenceRefs, ...routeLinks.map((link) => link.evidenceItemId), ...targetLinks.map((link) => link.evidenceItemId), ...contactLinks.map((link) => link.evidenceItemId)])];
      const gate = cardType === 'outreach'
        ? actionCardGate({ opportunityStatus: opportunity.status, targetStakeholderRoleId: stakeholder.stakeholder.id, primaryContactPointId: primary!.contact.id, primaryContactStatus: primary!.contact.verificationStatus, routeId: opportunity.routeId, evidenceRefs: boundEvidenceRefs, unresolvedCriticalUnknowns: output.result.criticalUnknowns, generatedContentCount: [output.result.emailBody, output.result.socialMessage, output.result.callOpening, output.result.contactFormMessage].filter((value) => value?.trim()).length })
        : researchActionCardGate({ cardType, opportunityStatus: opportunity.status, targetRoleLabel, routeId: opportunity.routeId, evidenceRefs: boundEvidenceRefs, unknowns, researchPlan: output.result.researchPlan, objective: output.result.objective });
      if (!gate.passed) throw ApplicationFailure.nonRetryable('Action Card Gate failed', 'ACTION_CARD_GATE_FAILED', { reasonCodes: gate.reasonCodes });
      const [last] = await tx.select({ versionNo: actionCards.versionNo }).from(actionCards).where(eq(actionCards.opportunityId, input.opportunityId)).orderBy(desc(actionCards.versionNo)).limit(1);
      const versionNo = (last?.versionNo ?? 0) + 1;
      const result = output.result;
      const [card] = await tx.insert(actionCards).values({ tenantId: input.tenantId, opportunityId: input.opportunityId, versionNo, basedOnVersionNo: input.basedOnVersionNo, feedbackRefs: input.feedbackRefs ?? [], status: 'review', cardType, targetRoleLabel, targetStakeholderRoleId: stakeholder.stakeholder.id, primaryContactPointId: primary?.contact.id, backupContactPointId: backup?.contact.id, channel: result.channel ?? primary?.contact.contactType, objective: result.objective, contactReason: result.contactReason, timingReason: result.timingReason, stakeholderInterest: result.stakeholderInterest, valueHypothesis: result.valueHypothesis, emailSubject: cardType === 'outreach' ? result.emailSubject : undefined, emailBody: cardType === 'outreach' ? result.emailBody : undefined, socialMessage: cardType === 'outreach' ? result.socialMessage : undefined, callOpening: cardType === 'outreach' ? result.callOpening : undefined, contactFormMessage: cardType === 'outreach' ? result.contactFormMessage : undefined, attachmentsRequired: result.attachmentsRequired, followUpPlan: result.followUpPlan, successSignals: result.successSignals, completionSignals: result.completionSignals, researchPlan: result.researchPlan, unknowns }).returning();
      if (!card) throw new Error('Action Card insert returned no row');
      await this.artifactInTransaction(tx, input, 'action_card', 'Action Card', result, `Action card version ${versionNo}`, input.opportunityId, boundEvidenceRefs);
      for (const evidenceItemId of boundEvidenceRefs) await tx.insert(actionCardEvidenceLinks).values({ actionCardId: card.id, evidenceItemId }).onConflictDoNothing();
      await this.transition(tx, input, 'action_ready', 'action_card_generated', boundEvidenceRefs);
      await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, actionCardId: card.id, approvalType: 'action_card', status: 'pending' });
      await this.event(tx, input, 'action_card', card.id, 'action_card.version_created.v1', { after: { versionNo, cardType, basedOnVersionNo: input.basedOnVersionNo, feedbackRefs: input.feedbackRefs ?? [] }, evidenceRefs: boundEvidenceRefs, opportunityId: input.opportunityId });
      await this.event(tx, input, 'action_card', card.id, 'action_card.review_requested.v1', { after: { status: 'review' }, evidenceRefs: boundEvidenceRefs, opportunityId: input.opportunityId });
      return { actionCardId: card.id, versionNo, cardType };
    });
  }); }

  async recordActionCardDecision(input: Scoped<{ opportunityId: string; actionCardId: string; decision: 'approve' | 'request_changes'; comment?: string; decidedByUserId: string; expectedVersionNo: number }>): Promise<void> { return this.idempotentMutation(input, 'recordActionCardDecision', async (tx) => {
    await tx.execute(sql`select id from action_cards where id=${input.actionCardId} for update`);
    const [card] = await tx.select().from(actionCards).where(and(eq(actionCards.tenantId, input.tenantId), eq(actionCards.id, input.actionCardId), eq(actionCards.opportunityId, input.opportunityId))).limit(1);
    if (!card) throw ApplicationFailure.nonRetryable('Action Card not found', 'ACTION_CARD_NOT_FOUND');
    if (card.versionNo !== input.expectedVersionNo || card.status !== 'review') throw ApplicationFailure.nonRetryable('Action Card version conflict', 'ACTION_CARD_VERSION_CONFLICT');
    const approved = input.decision === 'approve';
    await tx.update(actionCards).set({ status: approved ? 'approved' : 'changes_requested', approvedBy: approved ? input.decidedByUserId : null, approvedAt: approved ? new Date() : null, updatedAt: new Date() }).where(eq(actionCards.id, card.id));
    await tx.update(approvals).set({ status: approved ? 'approved' : 'changes_requested', decidedBy: input.decidedByUserId, decidedAt: new Date(), comment: input.comment }).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.actionCardId, card.id), eq(approvals.approvalType, 'action_card'), eq(approvals.status, 'pending')));
    const evidence = await tx.select({ evidenceItemId: actionCardEvidenceLinks.evidenceItemId }).from(actionCardEvidenceLinks).where(eq(actionCardEvidenceLinks.actionCardId, card.id));
    const evidenceRefs = evidence.map((item) => item.evidenceItemId);
    await this.event(tx, input, 'action_card', card.id, approved ? 'action_card.approved.v1' : 'action_card.changes_requested.v1', { before: { status: card.status }, after: { status: approved ? 'approved' : 'changes_requested', comment: input.comment }, evidenceRefs, opportunityId: input.opportunityId });
    if (approved) await this.transition(tx, input, 'approved', 'action_card_approved', evidenceRefs);
  }); }

  private async ensureInteractionEvidence(input: Scoped<{ opportunityId: string; interactionId: string }>): Promise<string> {
    const interaction = await this.read(input, async (tx) => (await tx.select().from(interactions).where(and(eq(interactions.tenantId, input.tenantId), eq(interactions.missionId, input.missionId), eq(interactions.opportunityId, input.opportunityId), eq(interactions.id, input.interactionId))).limit(1))[0]);
    if (!interaction) throw ApplicationFailure.nonRetryable('Interaction not found', 'INTERACTION_NOT_FOUND');
    const existing = await this.read(input, async (tx) => (await tx.select().from(interactionEvidenceLinks).where(eq(interactionEvidenceLinks.interactionId, input.interactionId)).limit(1))[0]);
    if (existing) return existing.evidenceItemId;
    const content = interaction.rawContent ?? interaction.summary; const hash = createHash('sha256').update(content).digest('hex');
    const evidenceId = asUuid(`interaction:${input.interactionId}:${hash}`);
    const stored = await this.storage.put(input.tenantId, input.missionId, 'interactions', content, 'text/plain');
    return this.read(input, async (tx) => {
      const normalizedUrl = `urn:imea:interaction:${input.interactionId}`;
      const [source] = await tx.insert(sources).values({ tenantId: input.tenantId, missionId: input.missionId, sourceType: 'interaction_record', normalizedUrl, title: `Interaction ${input.interactionId}`, metadata: { authority: 'user_record', independentGroupKey: normalizedUrl } }).onConflictDoUpdate({ target: [sources.tenantId, sources.missionId, sources.normalizedUrl], set: { lastFetchedAt: new Date() } }).returning();
      if (!source) throw new Error('Interaction source insert returned no row');
      const [inserted] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, contentHash: hash, objectKey: stored.objectKey, extractedText: content, extractionMetadata: { interactionId: input.interactionId } }).onConflictDoNothing().returning();
      const snapshot = inserted ?? (await tx.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.sourceId, source.id), eq(sourceSnapshots.contentHash, hash))).limit(1))[0];
      if (!snapshot) throw new Error('Interaction snapshot insert returned no row');
      await tx.update(sources).set({ latestSnapshotId: snapshot.id }).where(eq(sources.id, source.id));
      await tx.insert(evidenceItems).values({ id: evidenceId, tenantId: input.tenantId, missionId: input.missionId, sourceSnapshotId: snapshot.id, excerpt: content.slice(0, 2_000), locator: { interactionId: input.interactionId, startOffset: 0, endOffset: content.length }, stance: 'support', relevance: 100, freshness: 100 }).onConflictDoNothing();
      await tx.insert(interactionEvidenceLinks).values({ interactionId: input.interactionId, evidenceItemId: evidenceId }).onConflictDoNothing();
      return evidenceId;
    });
  }

  async interpretInteraction(input: Scoped<{ opportunityId: string; interactionId: string }>): Promise<InteractionInterpretation> { return this.idempotent(input, 'interpretInteraction', async () => {
    const evidenceId = await this.ensureInteractionEvidence(input);
    const output = await this.runner.execute<AgentEnvelope<InteractionInterpretation>>(await this.task(input, 'interaction_interpreter', `Interpret the full content of interaction ${input.interactionId}`));
    return { ...output.result, interactionId: input.interactionId, interactionEvidenceRef: evidenceId };
  }); }

  async applyInteractionInterpretation(input: Scoped<{ opportunityId: string; interactionId: string; interpretation: InteractionInterpretation }>): Promise<{ status: OpportunityStatus; regenerateActionCard: boolean; feedbackRefs: string[] }> { return this.idempotent(input, 'applyInteractionInterpretation', async () => this.read(input, async (tx) => {
    await tx.execute(sql`select id from interactions where id=${input.interactionId} for update`);
    await tx.execute(sql`select id from opportunities where id=${input.opportunityId} for update`);
    const [interaction] = await tx.select().from(interactions).where(and(eq(interactions.tenantId, input.tenantId), eq(interactions.missionId, input.missionId), eq(interactions.opportunityId, input.opportunityId), eq(interactions.id, input.interactionId))).limit(1);
    const [opportunity] = await tx.select().from(opportunities).where(and(eq(opportunities.tenantId, input.tenantId), eq(opportunities.missionId, input.missionId), eq(opportunities.id, input.opportunityId))).limit(1);
    if (!interaction || !opportunity) throw ApplicationFailure.nonRetryable('Interaction scope mismatch', 'INTERACTION_NOT_FOUND');
    const allEvidenceRefs = new Set<string>([input.interpretation.interactionEvidenceRef]);
    for (const fact of input.interpretation.extractedFacts) {
      fact.evidenceRefs.forEach((id) => allEvidenceRefs.add(id));
      const [claim] = await tx.insert(claims).values({ tenantId: input.tenantId, missionId: input.missionId, subjectEntityId: opportunity.organizationId, claimType: fact.claimType, statement: fact.statement, valueJson: fact.valueJson, status: fact.status, confidence: fact.confidence, origin: 'interaction', impactLevel: 'high' }).returning();
      if (!claim) continue;
      for (const evidenceItemId of fact.evidenceRefs) await tx.insert(claimEvidenceLinks).values({ claimId: claim.id, evidenceItemId, weight: 100 }).onConflictDoNothing();
      await tx.insert(interactionClaimLinks).values({ interactionId: interaction.id, claimId: claim.id, changeType: 'created' }).onConflictDoNothing();
      await this.event(tx, input, 'interaction', interaction.id, 'interaction.claim_created.v1', { after: { claimId: claim.id }, evidenceRefs: fact.evidenceRefs, opportunityId: opportunity.id });
    }
    for (const update of input.interpretation.contactUpdates) {
      update.evidenceRefs.forEach((id) => allEvidenceRefs.add(id));
      const [contact] = await tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, input.tenantId), eq(contactPoints.missionId, input.missionId), eq(contactPoints.id, update.contactPointId))).limit(1);
      if (!contact) continue;
      const proposed = update.proposedStatus ?? contact.verificationStatus;
      const facts: ContactVerificationFacts = { formatCheckPassed: true, exactValueListedByOfficialOrganization: false, independentConfirmationGroups: [], employmentConfirmationEvidenceIds: update.evidenceRefs, manualConfirmation: { userId: interaction.actorUserId, confirmedAt: interaction.occurredAt.toISOString(), comment: update.reason } };
      await tx.update(contactPoints).set({ verificationStatus: proposed, lastVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(contactPoints.id, contact.id));
      const [verification] = await tx.insert(contactVerifications).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, method: 'interaction', result: 'passed', score: 100, details: { reason: update.reason }, verificationStatusBefore: contact.verificationStatus, verificationStatusAfter: proposed, facts }).returning();
      if (verification) for (const evidenceItemId of update.evidenceRefs) await tx.insert(contactVerificationEvidenceLinks).values({ contactVerificationId: verification.id, evidenceItemId, purpose: 'interaction_confirmation' }).onConflictDoNothing();
      await this.event(tx, input, 'interaction', interaction.id, 'interaction.contact_updated.v1', { after: { contactPointId: contact.id, status: proposed }, evidenceRefs: update.evidenceRefs, opportunityId: opportunity.id });
    }
    for (const update of input.interpretation.routeUpdates) {
      update.evidenceRefs.forEach((id) => allEvidenceRefs.add(id));
      const [route] = await tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.id, update.routeId))).limit(1);
      if (!route) continue;
      const confidence = Math.max(0, Math.min(100, route.confidence + update.confidenceDelta));
      await tx.update(marketRoutes).set({ confidence, updatedAt: new Date() }).where(eq(marketRoutes.id, route.id));
      await this.event(tx, input, 'interaction', interaction.id, 'interaction.route_updated.v1', { before: { routeId: route.id, confidence: route.confidence }, after: { routeId: route.id, confidence }, evidenceRefs: update.evidenceRefs, opportunityId: opportunity.id });
    }
    if (input.interpretation.scoreUpdate) {
      const dimensions = input.interpretation.scoreUpdate.dimensions;
      const [last] = await tx.select({ versionNo: opportunityScores.versionNo }).from(opportunityScores).where(eq(opportunityScores.opportunityId, opportunity.id)).orderBy(desc(opportunityScores.versionNo)).limit(1);
      const value = (key: string) => Number(dimensions[key] ?? 0);
      const finalScore = Math.round(Object.values(dimensions).reduce((sum, item) => sum + Number(item), 0) / Math.max(Object.keys(dimensions).length, 1));
      await tx.insert(opportunityScores).values({ opportunityId: opportunity.id, versionNo: (last?.versionNo ?? 0) + 1, productFit: value('productFit'), routeFit: value('routeFit'), demandSignal: value('demandSignal'), timingSignal: value('timingSignal'), stakeholderRelevance: value('stakeholderRelevance'), contactability: value('contactability'), evidenceQuality: value('evidenceQuality'), strategicValue: value('strategicValue'), baseScore: String(finalScore), finalScore, rationale: input.interpretation.scoreUpdate.rationale, generatedBy: 'interaction' });
      await tx.update(opportunities).set({ score: finalScore, nextAction: input.interpretation.nextAction.objective, updatedAt: new Date() }).where(eq(opportunities.id, opportunity.id));
      await this.event(tx, input, 'opportunity', opportunity.id, 'opportunity.scored.v1', { after: { score: finalScore }, evidenceRefs: input.interpretation.scoreUpdate.evidenceRefs, opportunityId: opportunity.id });
    }
    let status = opportunity.status;
    if (input.interpretation.opportunityTransition) {
      await this.transition(tx, input, input.interpretation.opportunityTransition.to, input.interpretation.opportunityTransition.trigger, input.interpretation.opportunityTransition.evidenceRefs, interaction.id);
      status = input.interpretation.opportunityTransition.to;
      await this.event(tx, input, 'interaction', interaction.id, 'interaction.opportunity_transitioned.v1', { before: { status: opportunity.status }, after: { status }, evidenceRefs: input.interpretation.opportunityTransition.evidenceRefs, opportunityId: opportunity.id });
    }
    await this.artifactInTransaction(tx, input, 'interaction_interpretation', 'Interaction Interpretation', input.interpretation, `Interaction interpreted with ${input.interpretation.extractedFacts.length} facts`, opportunity.id, [...allEvidenceRefs]);
    await tx.update(interactions).set({ interpretationStatus: 'interpreted', interpretedAt: new Date() }).where(eq(interactions.id, interaction.id));
    await this.event(tx, input, 'interaction', interaction.id, 'interaction.interpreted.v1', { after: { status, regenerateActionCard: input.interpretation.nextAction.regenerateActionCard }, evidenceRefs: [...allEvidenceRefs], opportunityId: opportunity.id });
    return { status, regenerateActionCard: input.interpretation.nextAction.regenerateActionCard, feedbackRefs: [interaction.id] };
  })); }

  async runFocusedOpportunityResearch(input: Scoped<{ opportunityId: string; focus?: string }>): Promise<ActivityResult> { return this.idempotent(input, 'runFocusedOpportunityResearch', async () => { const output = await this.runner.execute<AgentEnvelope<QualificationResult>>(await this.task(input, 'opportunity_qualifier', `Focused opportunity research: ${input.focus ?? 'open questions'}`)); return ok(input.opportunityId, { score: output.result.scores.evidenceQuality }); }); }

  async reportOpportunityMilestone(input: Scoped<{ opportunityId: string; workflowId: string; milestone: string; opportunityStatus: OpportunityStatus; actionCardId?: string; occurredAt: string }>): Promise<void> { return this.idempotent(input, 'reportOpportunityMilestone', async () => {
    await this.temporal.signalMission(input.tenantId, input.missionId, 'opportunityMilestoneReported', { opportunityId: input.opportunityId, workflowId: input.workflowId, milestone: input.milestone, opportunityStatus: input.opportunityStatus, ...(input.actionCardId ? { actionCardId: input.actionCardId } : {}), occurredAt: input.occurredAt });
  }); }

  async closeOpportunity(input: Scoped<{ opportunityId: string }>): Promise<void> { return this.idempotent(input, 'closeOpportunity', async () => this.read(input, async (tx) => { const [row] = await tx.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).limit(1); if (row) await this.event(tx, input, 'opportunity', row.id, 'opportunity.closed.v1', { after: { status: row.status }, opportunityId: row.id }); await tx.update(workflowInstances).set({ status: 'completed', closedAt: new Date(), updatedAt: new Date() }).where(eq(workflowInstances.opportunityId, input.opportunityId)); })); }

  async loadRefreshScope(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled' }>): Promise<{ sourceIds: string[]; contactPointIds: string[]; competitorIds: string[] }> { return this.idempotent(input, 'loadRefreshScope', async () => this.read(input, async (tx) => {
    await this.event(tx, input, 'refresh', asUuid(`refresh:${input.tenantId}:${input.missionId}:${input.requestId}`), 'refresh.started.v1', { after: { triggerType: input.triggerType, scheduledAt: input.scheduledAt } });
    const [sourceRows, contactRows, competitorRows] = await Promise.all([
      tx.select({ id: sources.id }).from(sources).where(and(eq(sources.tenantId, input.tenantId), eq(sources.missionId, input.missionId))).orderBy(desc(sources.lastFetchedAt)).limit(20),
      tx.select({ id: contactPoints.id }).from(contactPoints).where(and(eq(contactPoints.tenantId, input.tenantId), eq(contactPoints.missionId, input.missionId), sql`${contactPoints.lastVerifiedAt} is null or ${contactPoints.lastVerifiedAt} < now() - interval '30 days'`)).limit(20),
      tx.select({ id: competitorProfiles.id }).from(competitorProfiles).where(and(eq(competitorProfiles.tenantId, input.tenantId), eq(competitorProfiles.missionId, input.missionId))).limit(20),
    ]);
    return { sourceIds: sourceRows.map((row) => row.id), contactPointIds: contactRows.map((row) => row.id), competitorIds: competitorRows.map((row) => row.id) };
  })); }

  async refreshSource(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; sourceId: string }>): Promise<{ changed: boolean; snapshotId?: string }> { return this.idempotent(input, 'refreshSource', async () => {
    const source = await this.read(input, async (tx) => (await tx.select().from(sources).where(and(eq(sources.tenantId, input.tenantId), eq(sources.missionId, input.missionId), eq(sources.id, input.sourceId))).limit(1))[0]);
    if (!source?.url) return { changed: false };
    const connector = this.connectors.get('browser'); if (!connector) return { changed: false };
    const result = await connector.execute({ tenantId: input.tenantId, missionId: input.missionId, operation: 'fetch_page', url: source.url });
    const content = result.items[0]?.content ?? ''; const hash = createHash('sha256').update(content).digest('hex');
    const existing = await this.read(input, async (tx) => (await tx.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.sourceId, source.id), eq(sourceSnapshots.contentHash, hash))).limit(1))[0]);
    if (existing) { await this.read(input, async (tx) => { await tx.update(sources).set({ lastFetchedAt: new Date() }).where(eq(sources.id, source.id)); }); return { changed: false }; }
    const stored = await this.storage.put(input.tenantId, input.missionId, 'refresh', content, 'text/plain');
    return this.read(input, async (tx) => { const [snapshot] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, contentHash: hash, objectKey: stored.objectKey, extractedText: content, httpStatus: 200, extractionMetadata: { refresh: true } }).returning(); if (!snapshot) return { changed: false }; await tx.update(sources).set({ latestSnapshotId: snapshot.id, lastFetchedAt: new Date() }).where(eq(sources.id, source.id)); await this.event(tx, input, 'refresh', asUuid(`refresh:${input.requestId}`), 'refresh.source_changed.v1', { after: { sourceId: source.id, snapshotId: snapshot.id }, metadata: { contentHash: hash } }); return { changed: true, snapshotId: snapshot.id }; });
  }); }

  async refreshContact(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; contactPointId: string }>): Promise<ActivityResult> { return this.idempotent(input, 'refreshContact', async () => this.read(input, async (tx) => { const [contact] = await tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, input.tenantId), eq(contactPoints.missionId, input.missionId), eq(contactPoints.id, input.contactPointId))).limit(1); if (!contact) return { id: input.contactPointId, status: 'failed' }; const facts: ContactVerificationFacts = { formatCheckPassed: true, exactValueListedByOfficialOrganization: false, independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] }; await tx.insert(contactVerifications).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, method: 'source_cross_check', result: 'partial', score: contact.confidence, details: { refresh: true }, verificationStatusBefore: contact.verificationStatus, verificationStatusAfter: 'stale', facts }); await tx.update(contactPoints).set({ verificationStatus: 'stale', updatedAt: new Date() }).where(eq(contactPoints.id, contact.id)); await this.event(tx, input, 'refresh', asUuid(`refresh:${input.requestId}`), 'refresh.contact_reverified.v1', { before: { contactPointId: contact.id, status: contact.verificationStatus }, after: { status: 'stale' } }); return ok(contact.id, { previousStatus: contact.verificationStatus, status: 'stale' }); })); }
  async refreshCompetitor(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; competitorId: string }>): Promise<ActivityResult> { return this.idempotent(input, 'refreshCompetitor', () => Promise.resolve(ok(input.competitorId, { changed: false }))); }

  async createRefreshProposal(input: Scoped<{ scheduledAt: string; requestId: string; triggerType: 'manual' | 'scheduled'; changedSnapshotIds: string[]; reverifiedContactCount: number; changedCompetitorCount: number }>) { return this.idempotent(input, 'createRefreshProposal', async () => this.read(input, async (tx) => {
    const payload = { changedSnapshotIds: input.changedSnapshotIds, scheduledAt: input.scheduledAt, triggerType: input.triggerType, reverifiedContactCount: input.reverifiedContactCount, changedCompetitorCount: input.changedCompetitorCount };
    const version = await this.artifactInTransaction(tx, input, 'refresh_proposal', `Refresh Proposal ${input.scheduledAt}`, payload, `${input.changedSnapshotIds.length} changed sources`);
    const [proposal] = await tx.insert(refreshProposals).values({ tenantId: input.tenantId, missionId: input.missionId, artifactVersionId: version.id, triggerType: input.triggerType, changedSourceCount: input.changedSnapshotIds.length, reverifiedContactCount: input.reverifiedContactCount, changedCompetitorCount: input.changedCompetitorCount, affectedOpportunityIds: [] }).returning();
    if (!proposal) throw new Error('Refresh proposal insert returned no row');
    await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, artifactVersionId: version.id, approvalType: 'refresh_proposal', status: 'pending' });
    await this.event(tx, input, 'refresh', proposal.id, 'refresh.proposal_created.v1', { after: { proposalId: proposal.id, changedSourceCount: proposal.changedSourceCount, reverifiedContactCount: proposal.reverifiedContactCount, changedCompetitorCount: proposal.changedCompetitorCount } });
    await this.event(tx, input, 'refresh', proposal.id, 'refresh.completed.v1', { after: { proposalId: proposal.id } });
    return { proposalId: proposal.id, changedSourceCount: proposal.changedSourceCount, reverifiedContactCount: proposal.reverifiedContactCount, changedCompetitorCount: proposal.changedCompetitorCount, affectedOpportunityIds: proposal.affectedOpportunityIds };
  })); }

  async applyRefreshProposal(input: Scoped<{ proposalId: string; actor: { type: 'user' | 'agent' | 'system'; id?: string } }>): Promise<ActivityResult> { return this.idempotent(input, 'applyRefreshProposal', async () => this.read(input, async (tx) => { const [proposal] = await tx.select().from(refreshProposals).where(and(eq(refreshProposals.tenantId, input.tenantId), eq(refreshProposals.missionId, input.missionId), eq(refreshProposals.id, input.proposalId))).limit(1); if (!proposal) throw ApplicationFailure.nonRetryable('Refresh proposal not found', 'REFRESH_PROPOSAL_NOT_FOUND'); await tx.update(refreshProposals).set({ status: 'accepted', acceptedAt: new Date(), acceptedBy: input.actor.type === 'user' ? input.actor.id : undefined }).where(eq(refreshProposals.id, proposal.id)); await tx.update(artifactVersions).set({ status: 'accepted', acceptedAt: new Date(), acceptedByUserId: input.actor.type === 'user' ? input.actor.id : undefined }).where(eq(artifactVersions.id, proposal.artifactVersionId)); await this.event(tx, input, 'refresh', proposal.id, 'refresh.proposal_accepted.v1', { before: { status: proposal.status }, after: { status: 'accepted' } }); return ok(proposal.id); })); }
}

