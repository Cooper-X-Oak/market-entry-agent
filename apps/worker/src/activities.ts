import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AgentRunner } from '@imea/agents';
import type {
  ActionCardResult, ActivityCommandScope, AgentTaskInput, BudgetConfig, ContactVerificationFacts,
  EntityCandidate, InteractionInterpretation, MarketRouteResearchResult, MissionBrief, OpportunityStatus,
} from '@imea/contracts';
import type { Connector, ObjectStorageConnector } from '@imea/connectors';
import {
  actionCards, agentRuns, approvals, ArtifactRepository, artifacts, artifactVersions, claimEvidenceLinks, claims,
  competitorProfiles, contactPointEvidenceLinks, contactPoints, contactVerificationEvidenceLinks,
  contactVerifications, DomainEventWriter, domainEvents, entities, entityRelationships, evidenceItems,
  idempotencyRecords, industryOpinions, interactionClaimLinks, interactionEvidenceLinks, interactions,
  marketRoutes, missionEntities, missionSources, missions, opportunities, opportunityContacts, opportunityScores,
  opportunityStakeholders, refreshProposals, sources, sourceSnapshots, stakeholderRoles, toolRuns,
  TransactionManager, workflowInstances, type Database, type DatabaseTransaction,
} from '@imea/database';
import { actionCardGate, deriveContactVerificationStatus, scoreOpportunity, transitionOpportunity } from '@imea/domain';
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
interface StakeholderResult { stakeholders: Array<{ organizationId: string; personCandidate?: EntityCandidate; roleType: typeof stakeholderRoles.$inferInsert.roleType; title?: string; decisionInfluence: number; contactPriority: number; relevanceReason: string; evidenceRefs: string[]; confidence: number }> }
interface ContactResult { contactPoints: Array<{ organizationId: string; personId?: string; stakeholderRoleId?: string; contactType: typeof contactPoints.$inferInsert.contactType; value: string; normalizedValue: string; label?: string; isPublic: boolean; contactEvidenceRefs: string[]; employmentEvidenceRefs: string[]; sourceAuthority: string; independentGroupKeys: string[]; confidence: number; language?: string; timezone?: string; recommendedRank: number }> }
interface QualificationResult { hypothesis: string; recommendedStatus: string; commercialValueBand: 'very_low' | 'low' | 'medium' | 'high' | 'strategic'; estimatedSalesHours: number; estimatedTechnicalHours: number; estimatedMarketCostPoints: number; scores: { productFit: number; routeFit: number; demandSignal: number; timingSignal: number; stakeholderRelevance: number; contactability: number; evidenceQuality: number; strategicValue: number }; rationale: Record<string, string>; nextAction: string; evidenceRefs: string[]; unknowns: string[] }
interface EntityResolutionResult { decision: 'create' | 'merge' | 'link'; matchedEntityId?: string; canonicalName: string; confidence: number; reasons: string[]; evidenceRefs: string[] }

const terminalDate = new Date('2099-12-31T00:00:00.000Z');
const ok = (id: string = randomUUID(), metadata?: Record<string, unknown>): ActivityResult => ({ id, status: 'succeeded', ...(metadata ? { metadata } : {}) });
const asUuid = (seed: string): string => { const hash = createHash('sha256').update(seed).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`; };

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

  private transactionContext(input: ActivityCommandScope) {
    return { tenantId: input.tenantId, actor: input.requestedBy ?? { type: 'system' as const, id: 'temporal-worker' }, correlationId: input.correlationId, ...(input.causationId ? { causationId: input.causationId } : {}) };
  }

  private async read<T>(input: ActivityCommandScope, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.transactionContext(input), work);
  }

  private async idempotent<T>(input: ActivityCommandScope, activityType: string, work: () => Promise<T>): Promise<T> {
    const endpoint = `activity:${activityType}`;
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.read(input, async (tx) => (await tx.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.tenantId, input.tenantId), eq(idempotencyRecords.endpoint, endpoint), eq(idempotencyRecords.idempotencyKey, input.idempotencyKey))).limit(1))[0]);
    if (existing) return (existing.responseBody as { value: T }).value;
    const value = await work();
    await this.read(input, async (tx) => {
      await tx.insert(idempotencyRecords).values({ tenantId: input.tenantId, idempotencyKey: input.idempotencyKey, endpoint, requestHash, responseStatus: 200, responseBody: { value: value ?? null }, expiresAt: terminalDate }).onConflictDoNothing();
    });
    return value;
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
        objective: `${objective}\nMission: ${mission.name}\nCompany: ${mission.companyName}\nWebsite: ${mission.companyWebsite}\nProducts: ${mission.productScope}\nCountries: ${mission.targetCountries.join(', ')}\nIndustries: ${mission.targetIndustries.join(', ')}`,
        artifactRefs: currentArtifacts.filter((artifact): artifact is typeof artifact & { versionId: string } => artifact.versionId !== null).map((artifact) => ({ artifactId: artifact.artifactId, versionId: artifact.versionId, type: artifact.type })),
        knownClaims: [
          { claimId: mission.id, statement: `website:${mission.companyWebsite}`, status: 'observed', confidence: 100, evidenceRefs: [] },
          ...uploadedSources.filter((source): source is { objectKey: string; originalName: string | null } => Boolean(source.objectKey)).map((source) => ({ claimId: mission.id, statement: `document:${source.originalName ?? 'upload'}|${source.objectKey}`, status: 'observed', confidence: 100, evidenceRefs: [] })),
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
        tx.select({ value: sql<number>`count(*)::int` }).from(toolRuns).where(and(eq(toolRuns.missionId, input.missionId), inArray(toolRuns.connectorType, ['browser','company_website','document']))),
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

  async loadMission(input: Scoped) { return this.idempotent(input, 'loadMission', async () => { const mission = await this.mission(input); const budget = mission.budgetConfig as BudgetConfig; return { id: mission.id, budget, topTargetLimit: budget.maxTargets }; }); }

  async compileMission(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'compileMission', async () => {
    const output = await this.runner.execute<AgentEnvelope<MissionBrief>>(await this.task(input, 'mission_compiler', 'Compile mission brief'));
    return this.read(input, async (tx) => {
      const [before] = await tx.select().from(missions).where(eq(missions.id, input.missionId)).limit(1);
      await tx.update(missions).set({ currentStage: 'compiling', status: 'running', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      const version = await this.artifactInTransaction(tx, input, 'mission_brief', 'Mission Brief', output.result, 'Structured mission scope and open questions');
      await this.event(tx, input, 'mission', input.missionId, 'mission.started.v1', { before, after: { status: 'running', stage: 'compiling' } });
      return ok(version.id, { artifactVersionId: version.id });
    });
  }); }

  async ingestCompanySources(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'ingestCompanySources', async () => {
    const mission = await this.mission(input);
    const connector = this.connectors.get('browser') ?? this.connectors.get('company_website');
    if (!connector) throw ApplicationFailure.nonRetryable('Browser connector not configured', 'CONNECTOR_UNAVAILABLE');
    const result = await connector.execute({ tenantId: input.tenantId, missionId: input.missionId, operation: 'fetch_page', url: mission.companyWebsite });
    const item = result.items[0]; const content = item?.content ?? '';
    const suppliedContentHash = item?.metadata.contentHash;
    const contentHash = typeof suppliedContentHash === 'string' ? suppliedContentHash : createHash('sha256').update(content).digest('hex');
    const stored = result.rawObjectKey ? { objectKey: result.rawObjectKey, contentHash } : await this.storage.put(input.tenantId, input.missionId, 'company-website', content, 'text/plain');
    return this.read(input, async (tx) => {
      const normalizedUrl = new URL(mission.companyWebsite).toString();
      const [source] = await tx.insert(sources).values({ tenantId: input.tenantId, missionId: input.missionId, sourceType: 'company_website', url: mission.companyWebsite, normalizedUrl, title: item?.title ?? mission.companyName, language: mission.outputLanguages[0] ?? 'en', metadata: { authority: 'official_organization', independentGroupKey: new URL(normalizedUrl).hostname } }).onConflictDoUpdate({ target: [sources.tenantId, sources.missionId, sources.normalizedUrl], set: { lastFetchedAt: new Date(), status: 'active' } }).returning();
      if (!source) throw new Error('Company source insert returned no row');
      const [inserted] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, httpStatus: Number(item?.metadata.httpStatus ?? 200), contentHash: stored.contentHash, objectKey: stored.objectKey, extractedText: content, extractionMetadata: { connector: connector.type } }).onConflictDoNothing().returning();
      const snapshot = inserted ?? (await tx.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.sourceId, source.id), eq(sourceSnapshots.contentHash, stored.contentHash))).limit(1))[0];
      if (!snapshot) throw new Error('Company snapshot insert returned no row');
      await tx.update(sources).set({ latestSnapshotId: snapshot.id, lastFetchedAt: new Date() }).where(eq(sources.id, source.id));
      await tx.update(missions).set({ currentStage: 'ingesting_company_data', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
      await this.event(tx, input, 'mission', input.missionId, 'mission.stage_changed.v1', { before: { stage: mission.currentStage }, after: { stage: 'ingesting_company_data', sourceSnapshotId: snapshot.id } });
      return ok(snapshot.id, { contentHash: stored.contentHash });
    });
  }); }

  async extractCapabilityClaims(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'extractCapabilityClaims', async () => {
    const output = await this.runner.execute<AgentEnvelope<CapabilityResult>>(await this.task(input, 'capability_evidence_extractor', 'Extract minimum viable capability evidence'));
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

  async researchMarketRoutes(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'researchMarketRoutes', async () => {
    const output = await this.runner.execute<AgentEnvelope<MarketRouteResearchResult>>(await this.task(input, 'market_route_researcher', 'Research market entry routes'));
    return this.read(input, async (tx) => {
      const evidenceRefs = [...new Set(output.result.routes.flatMap((route) => [...route.supportingEvidenceRefs, ...route.counterEvidenceRefs]))];
      const version = await this.artifactInTransaction(tx, input, 'market_route_set', 'Market Route Set', output.result, `${output.result.routes.length} route candidates`, undefined, evidenceRefs);
      for (const route of output.result.routes) {
        const [created] = await tx.insert(marketRoutes).values({ tenantId: input.tenantId, missionId: input.missionId, routeType: route.routeType, title: route.title, hypothesis: route.hypothesis, applicableScenarios: route.applicableScenarios, keyEntityTypes: route.keyEntityTypes, keyStakeholderRoles: route.keyStakeholderRoles, primaryChannels: route.primaryChannels, capabilityRequirements: route.capabilityRequirements, evidenceSummary: route.supportingEvidenceRefs.join(', '), counterEvidenceSummary: route.counterEvidenceRefs.join(', '), confidence: route.confidence, entryDifficulty: route.entryDifficulty, timeToFirstContactDays: route.timeToFirstContactDays, resourceIntensity: route.resourceIntensity, rank: route.rank, artifactVersionId: version.id }).returning();
        if (created) await this.event(tx, input, 'market_route', created.id, 'market_route.proposed.v1', { after: created, evidenceRefs: route.supportingEvidenceRefs });
      }
      return ok(version.id, { routeCount: output.result.routes.length });
    });
  }); }

  async researchCompetitors(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'researchCompetitors', async () => {
    const output = await this.runner.execute<AgentEnvelope<CompetitorResult>>(await this.task(input, 'competitor_researcher', 'Research competitors'));
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.competitors.flatMap((item) => item.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'competitor_set', 'Competitor Set', output.result, `${output.result.competitors.length} competitor profiles`, undefined, refs);
      for (const competitor of output.result.competitors) { const entityId = await this.upsertEntity(tx, input, competitor.entityCandidate, 'competitor'); await tx.insert(competitorProfiles).values({ tenantId: input.tenantId, missionId: input.missionId, entityId, marketPresenceSummary: competitor.marketPresenceSummary, routePatterns: competitor.routePatterns, localChannels: competitor.localChannels, exhibitions: competitor.exhibitions, publicCustomers: competitor.publicCustomers, certifications: competitor.certifications, serviceNetwork: competitor.serviceNetwork, marketMinimums: competitor.marketMinimums, opportunityGaps: competitor.opportunityGaps, confidence: competitor.confidence, artifactVersionId: version.id }); }
      return ok(version.id, { competitorCount: output.result.competitors.length });
    });
  }); }

  async researchExpertSignals(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'researchExpertSignals', async () => {
    const output = await this.runner.execute<AgentEnvelope<ExpertResult>>(await this.task(input, 'expert_signal_researcher', 'Research expert and industry signals'));
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

  async loadApprovedRoutes(input: Scoped): Promise<string[]> { return this.idempotent(input, 'loadApprovedRoutes', async () => this.read(input, async (tx) => (await tx.select({ id: marketRoutes.id }).from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.status, 'approved')))).map((row) => row.id))); }

  private async upsertEntity(tx: DatabaseTransaction, input: ActivityCommandScope, candidate: EntityCandidate, marketRole: string): Promise<string> {
    const [existing] = candidate.website ? await tx.select().from(entities).where(and(eq(entities.tenantId, input.tenantId), eq(entities.website, candidate.website))).limit(1) : [];
    let entityId = existing?.id;
    if (!entityId) { const [created] = await tx.insert(entities).values({ tenantId: input.tenantId, canonicalName: candidate.canonicalName, entityType: candidate.entityType as typeof entities.$inferInsert.entityType, website: candidate.website, countryCode: candidate.countryCode, region: candidate.region, city: candidate.city, description: candidate.description, externalIds: candidate.externalIds }).returning({ id: entities.id }); entityId = created?.id; }
    if (!entityId) throw new Error('Entity insert returned no row');
    await tx.insert(missionEntities).values({ missionId: input.missionId, entityId, marketRoles: [marketRole], relevanceScore: candidate.confidence, discoveryReason: candidate.description ?? 'Agent ecosystem discovery', targetStatus: candidate.confidence >= 70 ? 'target' : 'observed' }).onConflictDoUpdate({ target: [missionEntities.missionId, missionEntities.entityId], set: { relevanceScore: candidate.confidence, updatedAt: new Date() } });
    return entityId;
  }

  async discoverEcosystem(input: Scoped<{ routeId: string }>): Promise<ActivityResult> { return this.idempotent(input, 'discoverEcosystem', async () => {
    const output = await this.runner.execute<AgentEnvelope<EcosystemResult>>(await this.task(input, 'ecosystem_mapper', `Discover ecosystem for route ${input.routeId}`));
    return this.read(input, async (tx) => {
      const refs = [...new Set([...output.result.entities.flatMap((item) => item.evidenceRefs), ...output.result.relationships.flatMap((item) => item.evidenceRefs)])];
      const version = await this.artifactInTransaction(tx, input, 'ecosystem_map', 'Ecosystem Map', output.result, `${output.result.entities.length} entities`, undefined, refs);
      const entityIds = new Map<string, string>();
      for (const candidate of output.result.entities) entityIds.set(candidate.candidateKey, await this.upsertEntity(tx, input, candidate, 'ecosystem_member'));
      for (const relation of output.result.relationships) { const sourceEntityId = entityIds.get(relation.sourceCandidateKey); const targetEntityId = entityIds.get(relation.targetCandidateKey); if (sourceEntityId && targetEntityId) await tx.insert(entityRelationships).values({ tenantId: input.tenantId, missionId: input.missionId, sourceEntityId, targetEntityId, relationshipType: relation.relationshipType, directionality: 'directed', confidence: relation.confidence, attributes: { evidenceRefs: relation.evidenceRefs } }); }
      return ok(version.id, { entityCount: output.result.entities.length });
    });
  }); }

  async resolveEntities(input: Scoped): Promise<ActivityResult> { return this.idempotent(input, 'resolveEntities', async () => {
    const rows = await this.read(input, async (tx) => tx.select({ entity: entities }).from(missionEntities).innerJoin(entities, eq(entities.id, missionEntities.entityId)).where(and(eq(entities.tenantId, input.tenantId), eq(missionEntities.missionId, input.missionId))));
    const decisions: Array<{ entityId: string; result: EntityResolutionResult }> = [];
    for (const row of rows) { const output = await this.runner.execute<AgentEnvelope<EntityResolutionResult>>(await this.task(input, 'entity_resolver', `Resolve entity identity for ${row.entity.canonicalName}`)); decisions.push({ entityId: row.entity.id, result: output.result }); }
    return this.read(input, async (tx) => { const refs = [...new Set(decisions.flatMap((item) => item.result.evidenceRefs))]; const version = await this.artifactInTransaction(tx, input, 'ecosystem_map', 'Entity Resolution Decisions', { decisions }, `${decisions.length} entity identities resolved`, undefined, refs); return ok(version.id, { resolvedCount: decisions.length }); });
  }); }

  async rankTargets(input: Scoped): Promise<string[]> { return this.idempotent(input, 'rankTargets', async () => this.read(input, async (tx) => {
    await tx.update(missions).set({ currentStage: 'researching_targets', updatedAt: new Date() }).where(eq(missions.id, input.missionId));
    const rows = await tx.select().from(missionEntities).where(eq(missionEntities.missionId, input.missionId)).orderBy(desc(missionEntities.relevanceScore));
    const targetIds = rows.filter((row) => row.relevanceScore >= 50).map((row) => row.entityId).slice(0, 20);
    if (targetIds.length > 0) await tx.update(missionEntities).set({ targetStatus: 'high_priority', updatedAt: new Date() }).where(and(eq(missionEntities.missionId, input.missionId), inArray(missionEntities.entityId, targetIds)));
    await this.artifactInTransaction(tx, input, 'target_ranking', 'Target Ranking', rows, `${targetIds.length} qualified targets`);
    return targetIds;
  })); }

  async createOpportunity(input: Scoped<{ organizationId: string }>): Promise<string> { return this.idempotent(input, 'createOpportunity', async () => this.read(input, async (tx) => {
    const [existing] = await tx.select().from(opportunities).where(and(eq(opportunities.tenantId, input.tenantId), eq(opportunities.missionId, input.missionId), eq(opportunities.organizationId, input.organizationId))).limit(1);
    if (existing) return existing.id;
    const [route] = await tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.status, 'approved'))).orderBy(asc(marketRoutes.rank)).limit(1);
    if (!route) throw ApplicationFailure.nonRetryable('No approved route available', 'ROUTE_APPROVAL_REQUIRED');
    const [entity] = await tx.select().from(entities).where(and(eq(entities.tenantId, input.tenantId), eq(entities.id, input.organizationId))).limit(1);
    if (!entity) throw ApplicationFailure.nonRetryable('Entity not found', 'ENTITY_NOT_FOUND');
    const [created] = await tx.insert(opportunities).values({ tenantId: input.tenantId, missionId: input.missionId, organizationId: input.organizationId, routeId: route.id, title: `${entity.canonicalName} opportunity`, hypothesis: 'Organization fits the approved route and requires stakeholder/contact validation.', status: 'target_identified', nextAction: 'Map stakeholders' }).returning();
    if (!created) throw new Error('Opportunity insert returned no row');
    await this.event(tx, input, 'opportunity', created.id, 'opportunity.created.v1', { after: created, evidenceRefs: [], opportunityId: created.id });
    return created.id;
  })); }

  async recordChildWorkflow(input: Scoped<{ opportunityId: string; workflowId: string }>): Promise<void> { return this.idempotent(input, 'recordChildWorkflow', async () => this.read(input, async (tx) => { await tx.insert(workflowInstances).values({ tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, workflowType: 'opportunity', workflowId: input.workflowId, runId: input.workflowId, status: 'running' }).onConflictDoUpdate({ target: workflowInstances.workflowId, set: { status: 'running', updatedAt: new Date() } }); })); }

  private async updateMissionState(input: Scoped, activityType: string, values: Partial<typeof missions.$inferInsert>, eventType: string): Promise<void> { return this.idempotent(input, activityType, async () => this.read(input, async (tx) => { const [before] = await tx.select().from(missions).where(eq(missions.id, input.missionId)).limit(1); await tx.update(missions).set({ ...values, updatedAt: new Date() }).where(eq(missions.id, input.missionId)); await this.event(tx, input, 'mission', input.missionId, eventType, { before, after: values }); })); }
  async markMissionActive(input: Scoped): Promise<void> { return this.updateMissionState(input, 'markMissionActive', { currentStage: 'active', status: 'running' }, 'mission.activated.v1'); }
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

  async mapStakeholders(input: Scoped<{ opportunityId: string }>): Promise<ActivityResult> { return this.idempotent(input, 'mapStakeholders', async () => {
    const opportunity = await this.opportunity(input);
    const output = await this.runner.execute<AgentEnvelope<StakeholderResult>>(await this.task(input, 'stakeholder_mapper', 'Map decision stakeholders'));
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.stakeholders.flatMap((item) => item.evidenceRefs))];
      const version = await this.artifactInTransaction(tx, input, 'stakeholder_map', 'Stakeholder Map', output.result, `${output.result.stakeholders.length} stakeholders`, input.opportunityId, refs);
      for (const item of output.result.stakeholders) { const [stakeholder] = await tx.insert(stakeholderRoles).values({ tenantId: input.tenantId, missionId: input.missionId, organizationId: opportunity.organizationId, roleType: item.roleType, title: item.title, decisionInfluence: item.decisionInfluence, contactPriority: item.contactPriority, relevanceReason: item.relevanceReason, confidence: item.confidence }).returning(); if (stakeholder) await tx.insert(opportunityStakeholders).values({ opportunityId: input.opportunityId, stakeholderRoleId: stakeholder.id, roleInOpportunity: item.roleType, rank: item.contactPriority }).onConflictDoNothing(); }
      await this.transition(tx, input, 'stakeholder_mapped', 'stakeholder_mapping_completed', refs);
      return ok(version.id, { stakeholderCount: output.result.stakeholders.length });
    });
  }); }

  async findContactPaths(input: Scoped<{ opportunityId: string }>): Promise<string[]> { return this.idempotent(input, 'findContactPaths', async () => {
    const opportunity = await this.opportunity(input);
    const output = await this.runner.execute<AgentEnvelope<ContactResult>>(await this.task(input, 'contact_path_finder', 'Find public contact paths'));
    return this.read(input, async (tx) => {
      const refs = [...new Set(output.result.contactPoints.flatMap((item) => [...item.contactEvidenceRefs, ...item.employmentEvidenceRefs]))];
      const version = await this.artifactInTransaction(tx, input, 'contact_path_set', 'Contact Path Set', output.result, `${output.result.contactPoints.length} public paths`, input.opportunityId, refs);
      const ids: string[] = [];
      for (const item of output.result.contactPoints) {
        const [primaryEvidence] = await tx.select({ evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(evidenceItems).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(evidenceItems.tenantId, input.tenantId), inArray(evidenceItems.id, item.contactEvidenceRefs))).limit(1);
        if (!primaryEvidence) throw ApplicationFailure.nonRetryable('Contact candidate evidence is not persisted', 'CONTACT_EVIDENCE_MISSING');
        const [contact] = await tx.insert(contactPoints).values({ tenantId: input.tenantId, missionId: input.missionId, organizationId: opportunity.organizationId, personId: item.personId, stakeholderRoleId: item.stakeholderRoleId, contactType: item.contactType, value: item.value, normalizedValue: item.normalizedValue, label: item.label, isPublic: item.isPublic, sourceId: primaryEvidence.source.id, sourceLocator: primaryEvidence.evidence.locator, confidence: item.confidence, preferredRank: item.recommendedRank, language: item.language, timezone: item.timezone, metadata: { artifactVersionId: version.id } }).onConflictDoUpdate({ target: [contactPoints.missionId, contactPoints.contactType, contactPoints.normalizedValue], set: { confidence: item.confidence, updatedAt: new Date() } }).returning();
        if (!contact) continue;
        ids.push(contact.id);
        await tx.insert(opportunityContacts).values({ opportunityId: input.opportunityId, contactPointId: contact.id, usageType: item.recommendedRank === 1 ? 'primary' : 'backup', rank: item.recommendedRank }).onConflictDoNothing();
        for (const evidenceItemId of item.contactEvidenceRefs) await tx.insert(contactPointEvidenceLinks).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, evidenceItemId, relationType: evidenceItemId === item.contactEvidenceRefs[0] ? 'direct_listing' : 'corroboration', sourceAuthority: item.sourceAuthority, independentGroupKey: item.independentGroupKeys[0] ?? primaryEvidence.source.id, supportsValue: true, observedAt: primaryEvidence.snapshot.fetchedAt }).onConflictDoNothing();
        for (const evidenceItemId of item.employmentEvidenceRefs) await tx.insert(contactPointEvidenceLinks).values({ tenantId: input.tenantId, missionId: input.missionId, contactPointId: contact.id, evidenceItemId, relationType: 'employment_confirmation', sourceAuthority: item.sourceAuthority, independentGroupKey: item.independentGroupKeys[0] ?? primaryEvidence.source.id, supportsEmployment: true, observedAt: primaryEvidence.snapshot.fetchedAt }).onConflictDoNothing();
        await this.event(tx, input, 'contact_point', contact.id, 'contact_point.discovered.v1', { after: { contactType: contact.contactType, normalizedValue: contact.normalizedValue }, evidenceRefs: item.contactEvidenceRefs, opportunityId: input.opportunityId });
        await this.event(tx, input, 'contact_point', contact.id, 'contact_point.evidence_linked.v1', { evidenceRefs: [...item.contactEvidenceRefs, ...item.employmentEvidenceRefs], opportunityId: input.opportunityId });
      }
      await this.transition(tx, input, 'contact_path_found', 'contact_discovered', refs);
      return ids;
    });
  }); }

  async verifyContactPoint(input: Scoped<{ opportunityId: string; contactPointId: string }>): Promise<ActivityResult> { return this.idempotent(input, 'verifyContactPoint', async () => {
    const contact = await this.read(input, async (tx) => (await tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, input.tenantId), eq(contactPoints.missionId, input.missionId), eq(contactPoints.id, input.contactPointId))).limit(1))[0]);
    if (!contact) throw ApplicationFailure.nonRetryable('Contact not found', 'CONTACT_NOT_FOUND');
    const links = await this.read(input, async (tx) => tx.select().from(contactPointEvidenceLinks).where(eq(contactPointEvidenceLinks.contactPointId, contact.id)));
    const connector = this.connectors.get('contact_verification');
    const exact = links.find((link) => link.relationType === 'direct_listing' && link.sourceAuthority === 'official_organization');
    const result = connector ? await connector.execute({ tenantId: input.tenantId, missionId: input.missionId, operation: contact.contactType.includes('email') ? 'validate_mx' : 'validate_url', ...(contact.contactType.includes('email') ? {} : { url: contact.value }), options: { value: contact.value, officialSource: Boolean(exact), exactValueLocatorEvidenceId: exact?.evidenceItemId, independentConfirmationGroups: [...new Set(links.filter((link) => link.relationType === 'corroboration').map((link) => link.independentGroupKey))], employmentConfirmationEvidenceIds: links.filter((link) => link.supportsEmployment).map((link) => link.evidenceItemId) } }) : undefined;
    const score = Number(result?.items[0]?.metadata.score ?? contact.confidence);
    const facts = (result?.items[0]?.metadata.facts ?? { formatCheckPassed: true, exactValueListedByOfficialOrganization: Boolean(exact), ...(exact ? { exactValueLocatorEvidenceId: exact.evidenceItemId } : {}), independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] }) as ContactVerificationFacts;
    const status = deriveContactVerificationStatus(facts);
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

  async qualifyOpportunity(input: Scoped<{ opportunityId: string }>): Promise<{ score: number; status: OpportunityStatus; unknowns: string[] }> { return this.idempotent(input, 'qualifyOpportunity', async () => {
    const output = await this.runner.execute<AgentEnvelope<QualificationResult>>(await this.task(input, 'opportunity_qualifier', 'Qualify and score opportunity'));
    const result = output.result;
    const calculated = scoreOpportunity(result.scores, result.scores.evidenceQuality >= 70 ? 'high' : result.scores.evidenceQuality >= 40 ? 'medium' : 'low', 'contact_verified', result.commercialValueBand, { salesHours: result.estimatedSalesHours, technicalHours: result.estimatedTechnicalHours, marketCostPoints: result.estimatedMarketCostPoints, sampleCostPoints: 0, travelCostPoints: 0 });
    return this.read(input, async (tx) => {
      const [last] = await tx.select({ versionNo: opportunityScores.versionNo }).from(opportunityScores).where(eq(opportunityScores.opportunityId, input.opportunityId)).orderBy(desc(opportunityScores.versionNo)).limit(1);
      await tx.insert(opportunityScores).values({ opportunityId: input.opportunityId, versionNo: (last?.versionNo ?? 0) + 1, ...result.scores, baseScore: String(calculated.baseScore), finalScore: calculated.finalScore, rationale: result.rationale, generatedBy: 'agent' });
      await tx.update(opportunities).set({ hypothesis: result.hypothesis, score: calculated.finalScore, evidenceConfidence: result.scores.evidenceQuality >= 70 ? 'high' : result.scores.evidenceQuality >= 40 ? 'medium' : 'low', commercialValueBand: result.commercialValueBand, estimatedSalesHours: String(result.estimatedSalesHours), estimatedTechnicalHours: String(result.estimatedTechnicalHours), estimatedMarketCostPoints: String(result.estimatedMarketCostPoints), resourceEfficiency: String(calculated.resourceEfficiency), nextAction: result.nextAction, updatedAt: new Date() }).where(eq(opportunities.id, input.opportunityId));
      await this.artifactInTransaction(tx, input, 'opportunity_qualification', 'Opportunity Qualification', result, `Opportunity score ${calculated.finalScore}`, input.opportunityId, result.evidenceRefs);
      await this.event(tx, input, 'opportunity', input.opportunityId, 'opportunity.scored.v1', { after: { score: calculated.finalScore, dimensions: result.scores }, evidenceRefs: result.evidenceRefs, opportunityId: input.opportunityId });
      return { score: calculated.finalScore, status: 'contact_path_verified', unknowns: result.unknowns };
    });
  }); }

  async buildActionCard(input: Scoped<{ opportunityId: string; basedOnVersionNo?: number; feedbackRefs?: string[]; feedbackComment?: string }>): Promise<{ actionCardId: string; versionNo: number }> { return this.idempotent(input, 'buildActionCard', async () => {
    const output = await this.runner.execute<AgentEnvelope<ActionCardResult>>(await this.task(input, 'action_card_builder', input.feedbackComment ? `Revise action card using feedback: ${input.feedbackComment}` : 'Build executable action card'));
    return this.read(input, async (tx) => {
      await tx.execute(sql`select id from opportunities where id=${input.opportunityId} for update`);
      const [opportunity] = await tx.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).limit(1);
      const [stakeholder] = await tx.select().from(opportunityStakeholders).where(eq(opportunityStakeholders.opportunityId, input.opportunityId)).orderBy(asc(opportunityStakeholders.rank)).limit(1);
      const contacts = await tx.select({ link: opportunityContacts, contact: contactPoints }).from(opportunityContacts).innerJoin(contactPoints, eq(contactPoints.id, opportunityContacts.contactPointId)).where(eq(opportunityContacts.opportunityId, input.opportunityId)).orderBy(asc(opportunityContacts.rank));
      if (!opportunity || !stakeholder || !contacts[0]) throw ApplicationFailure.nonRetryable('Action Card prerequisites are missing', 'ACTION_CARD_GATE_FAILED');
      const gate = actionCardGate({ opportunityStatus: opportunity.status, targetStakeholderRoleId: stakeholder.stakeholderRoleId, primaryContactPointId: contacts[0].contact.id, primaryContactStatus: contacts[0].contact.verificationStatus, routeId: opportunity.routeId, evidenceRefs: output.result.evidenceRefs, unresolvedCriticalUnknowns: [] });
      if (!gate.passed) throw ApplicationFailure.nonRetryable('Action Card Gate failed', 'ACTION_CARD_GATE_FAILED', { reasonCodes: gate.reasonCodes });
      const [last] = await tx.select({ versionNo: actionCards.versionNo }).from(actionCards).where(eq(actionCards.opportunityId, input.opportunityId)).orderBy(desc(actionCards.versionNo)).limit(1);
      const versionNo = (last?.versionNo ?? 0) + 1;
      const result = output.result;
      const [card] = await tx.insert(actionCards).values({ tenantId: input.tenantId, opportunityId: input.opportunityId, versionNo, basedOnVersionNo: input.basedOnVersionNo, feedbackRefs: input.feedbackRefs ?? [], status: 'review', targetStakeholderRoleId: stakeholder.stakeholderRoleId, primaryContactPointId: contacts[0].contact.id, backupContactPointId: contacts[1]?.contact.id, channel: result.channel, objective: result.objective, contactReason: result.contactReason, timingReason: result.timingReason, stakeholderInterest: result.stakeholderInterest, valueHypothesis: result.valueHypothesis, emailSubject: result.emailSubject, emailBody: result.emailBody, socialMessage: result.socialMessage, callOpening: result.callOpening, contactFormMessage: result.contactFormMessage, attachmentsRequired: result.attachmentsRequired, followUpPlan: result.followUpPlan, successSignals: result.successSignals, completionSignals: result.completionSignals }).returning();
      if (!card) throw new Error('Action Card insert returned no row');
      await this.artifactInTransaction(tx, input, 'action_card', 'Action Card', result, `Action card version ${versionNo}`, input.opportunityId, result.evidenceRefs);
      if (opportunity.status === 'contact_path_verified') await this.transition(tx, input, 'action_ready', 'action_card_generated', result.evidenceRefs);
      await this.event(tx, input, 'action_card', card.id, 'action_card.version_created.v1', { after: { versionNo, basedOnVersionNo: input.basedOnVersionNo, feedbackRefs: input.feedbackRefs ?? [] }, evidenceRefs: result.evidenceRefs, opportunityId: input.opportunityId });
      await this.event(tx, input, 'action_card', card.id, 'action_card.review_requested.v1', { after: { status: 'review' }, evidenceRefs: result.evidenceRefs, opportunityId: input.opportunityId });
      return { actionCardId: card.id, versionNo };
    });
  }); }

  async recordActionCardDecision(input: Scoped<{ opportunityId: string; actionCardId: string; decision: 'approve' | 'request_changes'; comment?: string; decidedByUserId: string; expectedVersionNo: number }>): Promise<void> { return this.idempotent(input, 'recordActionCardDecision', async () => this.read(input, async (tx) => {
    await tx.execute(sql`select id from action_cards where id=${input.actionCardId} for update`);
    const [card] = await tx.select().from(actionCards).where(and(eq(actionCards.tenantId, input.tenantId), eq(actionCards.id, input.actionCardId), eq(actionCards.opportunityId, input.opportunityId))).limit(1);
    if (!card) throw ApplicationFailure.nonRetryable('Action Card not found', 'ACTION_CARD_NOT_FOUND');
    if (card.versionNo !== input.expectedVersionNo || card.status !== 'review') throw ApplicationFailure.nonRetryable('Action Card version conflict', 'ACTION_CARD_VERSION_CONFLICT');
    const approved = input.decision === 'approve';
    await tx.update(actionCards).set({ status: approved ? 'approved' : 'changes_requested', approvedBy: approved ? input.decidedByUserId : null, approvedAt: approved ? new Date() : null, updatedAt: new Date() }).where(eq(actionCards.id, card.id));
    await tx.insert(approvals).values({ tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, actionCardId: card.id, approvalType: 'action_card', status: approved ? 'approved' : 'changes_requested', requestedAt: card.createdAt, decidedBy: input.decidedByUserId, decidedAt: new Date(), comment: input.comment });
    await this.event(tx, input, 'action_card', card.id, approved ? 'action_card.approved.v1' : 'action_card.changes_requested.v1', { before: { status: card.status }, after: { status: approved ? 'approved' : 'changes_requested', comment: input.comment }, opportunityId: input.opportunityId });
    if (approved) await this.transition(tx, input, 'approved', 'action_card_approved', []);
  })); }

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
