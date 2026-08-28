import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AgentExecutionContext, BudgetConfig } from '@imea/contracts';
import { DomainError } from '@imea/domain';
import type { Database } from './client.js';
import {
  actionCards, approvals, artifacts, artifactVersions, claimEvidenceLinks, claims,
  contactPointEvidenceLinks, contactPoints, contactVerifications, entities, entityRelationships,
  evidenceItems, interactionEvidenceLinks, interactions, marketRoutes, missionEntities, missions, opportunities,
  opportunityScores, sourceSnapshots, sources, stakeholderRoles,
} from './schema/index.js';
import { TransactionManager } from './transaction.js';

export interface AgentContextScopeInput {
  tenantId: string;
  missionId: string;
  opportunityId?: string;
  skillKey: string;
  objective: string;
  outputLanguage: string;
  toolPermissions: string[];
}

function metadataString(metadata: Record<string, unknown>, key: string, fallback: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : fallback;
}

const iso = (value: Date | null | undefined): string | undefined => value?.toISOString();

export class AgentContextRepository {
  private readonly transactions: TransactionManager;
  constructor(database: Database) { this.transactions = new TransactionManager(database); }

  async load(input: AgentContextScopeInput): Promise<AgentExecutionContext> {
    const correlationId = randomUUID();
    return this.transactions.run({ tenantId: input.tenantId, actor: { type: 'agent', id: input.skillKey }, correlationId }, async (tx) => {
      const [mission] = await tx.select().from(missions).where(and(eq(missions.tenantId, input.tenantId), eq(missions.id, input.missionId))).limit(1);
      if (!mission) throw new DomainError({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });
      const routeRows = await tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, input.tenantId), eq(marketRoutes.missionId, input.missionId), eq(marketRoutes.status, 'approved')));
      const [opportunity] = input.opportunityId ? await tx.select().from(opportunities).where(and(eq(opportunities.tenantId, input.tenantId), eq(opportunities.missionId, input.missionId), eq(opportunities.id, input.opportunityId))).limit(1) : [];
      if (input.opportunityId && !opportunity) throw new DomainError({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' });
      const [organization] = opportunity ? await tx.select().from(entities).where(and(eq(entities.tenantId, input.tenantId), eq(entities.id, opportunity.organizationId))).limit(1) : [];
      const [missionEntity] = organization ? await tx.select().from(missionEntities).where(and(eq(missionEntities.missionId, input.missionId), eq(missionEntities.entityId, organization.id))).limit(1) : [];
      const relationshipRows = organization ? await tx.select().from(entityRelationships).where(and(eq(entityRelationships.tenantId, input.tenantId), eq(entityRelationships.missionId, input.missionId))) : [];
      const stakeholderRows = await tx.select().from(stakeholderRoles).where(and(
        eq(stakeholderRoles.tenantId, input.tenantId),
        eq(stakeholderRoles.missionId, input.missionId),
        ...(organization ? [eq(stakeholderRoles.organizationId, organization.id)] : []),
      ));
      const contactRows = await tx.select().from(contactPoints).where(and(
        eq(contactPoints.tenantId, input.tenantId),
        eq(contactPoints.missionId, input.missionId),
        ...(organization ? [eq(contactPoints.organizationId, organization.id)] : []),
      ));
      const contactIds = contactRows.map((contact) => contact.id);
      const contactEvidenceRows = contactIds.length > 0 ? await tx.select().from(contactPointEvidenceLinks).where(inArray(contactPointEvidenceLinks.contactPointId, contactIds)) : [];
      const verificationRows = contactIds.length > 0 ? await tx.select().from(contactVerifications).where(and(eq(contactVerifications.tenantId, input.tenantId), inArray(contactVerifications.contactPointId, contactIds))).orderBy(desc(contactVerifications.verifiedAt)) : [];
      const interactionRows = opportunity ? await tx.select().from(interactions).where(and(eq(interactions.tenantId, input.tenantId), eq(interactions.missionId, input.missionId), eq(interactions.opportunityId, opportunity.id))).orderBy(desc(interactions.occurredAt)).limit(20) : [];
      const interactionIds = interactionRows.map((interaction) => interaction.id);
      const interactionEvidenceRows = interactionIds.length > 0 ? await tx.select().from(interactionEvidenceLinks).where(inArray(interactionEvidenceLinks.interactionId, interactionIds)) : [];
      const claimRows = await tx.select().from(claims).where(and(eq(claims.tenantId, input.tenantId), eq(claims.missionId, input.missionId), ...(organization ? [eq(claims.subjectEntityId, organization.id)] : [])));
      const claimIds = claimRows.map((claim) => claim.id);
      const claimLinks = claimIds.length > 0 ? await tx.select().from(claimEvidenceLinks).where(inArray(claimEvidenceLinks.claimId, claimIds)) : [];
      const evidenceIds = [...new Set([...claimLinks.map((link) => link.evidenceItemId), ...contactEvidenceRows.map((link) => link.evidenceItemId), ...interactionEvidenceRows.map((link) => link.evidenceItemId)])];
      const evidenceRows = evidenceIds.length > 0
        ? await tx.select({ evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(evidenceItems).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(evidenceItems.tenantId, input.tenantId), inArray(evidenceItems.id, evidenceIds)))
        : [];
      const artifactRows = await tx.select({ artifact: artifacts, version: artifactVersions }).from(artifacts).innerJoin(artifactVersions, eq(artifactVersions.artifactId, artifacts.id)).where(and(eq(artifacts.tenantId, input.tenantId), eq(artifacts.missionId, input.missionId), ...(opportunity ? [eq(artifacts.opportunityId, opportunity.id)] : []))).orderBy(desc(artifactVersions.versionNo));
      const approvalRows = opportunity ? await tx.select().from(approvals).where(and(eq(approvals.tenantId, input.tenantId), eq(approvals.missionId, input.missionId), eq(approvals.opportunityId, opportunity.id))).orderBy(desc(approvals.requestedAt)) : [];
      const [score] = opportunity ? await tx.select().from(opportunityScores).where(eq(opportunityScores.opportunityId, opportunity.id)).orderBy(desc(opportunityScores.versionNo)).limit(1) : [];
      const [latestCard] = opportunity ? await tx.select().from(actionCards).where(and(eq(actionCards.tenantId, input.tenantId), eq(actionCards.opportunityId, opportunity.id))).orderBy(desc(actionCards.versionNo)).limit(1) : [];
      const scoreDimensions: Record<string, number> = score ? {
        productFit: score.productFit,
        routeFit: score.routeFit,
        demandSignal: score.demandSignal,
        timingSignal: score.timingSignal,
        stakeholderRelevance: score.stakeholderRelevance,
        contactability: score.contactability,
        evidenceQuality: score.evidenceQuality,
        strategicValue: score.strategicValue,
      } : {};

      return {
        contextVersion: 1,
        scope: { tenantId: input.tenantId, missionId: input.missionId, ...(opportunity ? { opportunityId: opportunity.id, organizationId: opportunity.organizationId, routeId: opportunity.routeId } : {}), ...(latestCard ? { actionCardId: latestCard.id } : {}) },
        mission: {
          id: mission.id, companyName: mission.companyName, companyWebsite: mission.companyWebsite, productScope: mission.productScope,
          targetCountries: mission.targetCountries, targetIndustries: mission.targetIndustries, targetProfiles: mission.targetProfiles,
          objective: mission.objective, successDefinition: mission.successDefinition, outputLanguages: mission.outputLanguages,
          budget: mission.budgetConfig as BudgetConfig, stage: mission.currentStage,
        },
        routes: routeRows.map((route) => ({ id: route.id, routeType: route.routeType, title: route.title, hypothesis: route.hypothesis, status: route.status, confidence: route.confidence, evidenceRefs: artifactRows.find((row) => row.version.id === route.artifactVersionId)?.version.evidenceRefs ?? [], acceptedArtifactVersionId: route.artifactVersionId })),
        ...(organization && missionEntity ? { organization: {
          id: organization.id, canonicalName: organization.canonicalName, ...(organization.website ? { website: organization.website } : {}),
          ...(organization.countryCode ? { countryCode: organization.countryCode } : {}), ...(organization.region ? { region: organization.region } : {}),
          ...(organization.city ? { city: organization.city } : {}), ...(organization.description ? { description: organization.description } : {}),
          marketRoles: missionEntity.marketRoles, ...(missionEntity.primaryRouteId ? { primaryRouteId: missionEntity.primaryRouteId } : {}),
          relevanceScore: missionEntity.relevanceScore, discoveryReason: missionEntity.discoveryReason,
          relationships: relationshipRows.filter((row) => row.sourceEntityId === organization.id || row.targetEntityId === organization.id).map((row) => ({
            relationshipType: row.relationshipType, counterpartEntityId: row.sourceEntityId === organization.id ? row.targetEntityId : row.sourceEntityId,
            directionality: row.directionality, confidence: row.confidence, ...(row.claimId ? { claimId: row.claimId } : {}),
            evidenceRefs: row.claimId ? claimLinks.filter((link) => link.claimId === row.claimId).map((link) => link.evidenceItemId) : [],
          })),
        } } : {}),
        ...(opportunity ? { opportunity: {
          id: opportunity.id, organizationId: opportunity.organizationId, routeId: opportunity.routeId, title: opportunity.title,
          hypothesis: opportunity.hypothesis, status: opportunity.status, priority: opportunity.priority, score: opportunity.score,
          scoreDimensions,
          evidenceConfidence: opportunity.evidenceConfidence, commercialValueBand: opportunity.commercialValueBand,
          resourceEfficiency: String(opportunity.resourceEfficiency), nextAction: opportunity.nextAction,
          unknowns: claimRows.filter((claim) => claim.status === 'unknown').map((claim) => claim.statement),
          ...(latestCard ? { latestActionCardVersion: latestCard.versionNo } : {}),
        } } : {}),
        stakeholders: stakeholderRows.map((row) => ({ id: row.id, organizationId: row.organizationId, ...(row.personId ? { personId: row.personId } : {}), roleType: row.roleType, ...(row.title ? { title: row.title } : {}), decisionInfluence: row.decisionInfluence, contactPriority: row.contactPriority, evidenceRefs: row.claimId ? claimLinks.filter((link) => link.claimId === row.claimId).map((link) => link.evidenceItemId) : [] })),
        contacts: contactRows.map((row) => { const verification = verificationRows.find((item) => item.contactPointId === row.id); return { id: row.id, organizationId: row.organizationId, ...(row.personId ? { personId: row.personId } : {}), ...(row.stakeholderRoleId ? { stakeholderRoleId: row.stakeholderRoleId } : {}), contactType: row.contactType, value: row.value, normalizedValue: row.normalizedValue, verificationStatus: row.verificationStatus, confidence: row.confidence, contactEvidenceRefs: contactEvidenceRows.filter((link) => link.contactPointId === row.id && link.supportsValue).map((link) => link.evidenceItemId), employmentEvidenceRefs: contactEvidenceRows.filter((link) => link.contactPointId === row.id && link.supportsEmployment).map((link) => link.evidenceItemId), ...(verification ? { verificationFacts: verification.facts } : {}) }; }),
        interactions: interactionRows.map((row) => ({ id: row.id, opportunityId: row.opportunityId, ...(row.actionCardId ? { actionCardId: row.actionCardId } : {}), interactionType: row.interactionType, occurredAt: row.occurredAt.toISOString(), ...(row.targetContactPointId ? { targetContactPointId: row.targetContactPointId } : {}), ...(row.channel ? { channel: row.channel } : {}), summary: row.summary, ...(row.rawContent ? { rawContent: row.rawContent } : {}), ...(row.rawContentObjectKey ? { rawContentObjectKey: row.rawContentObjectKey } : {}), outcome: row.outcome, submittedFacts: row.newFacts, ...(row.nextAction ? { nextAction: row.nextAction } : {}), ...(iso(row.followUpAt) ? { followUpAt: iso(row.followUpAt) } : {}) })),
        claims: claimRows.map((row) => ({ id: row.id, claimType: row.claimType, statement: row.statement, valueJson: row.valueJson, status: row.status, confidence: row.confidence, evidenceRefs: claimLinks.filter((link) => link.claimId === row.id).map((link) => link.evidenceItemId) })),
        evidence: evidenceRows.map(({ evidence, snapshot, source }) => ({ evidenceId: evidence.id, sourceId: source.id, sourceSnapshotId: snapshot.id, sourceType: source.sourceType, ...(source.url ? { url: source.url } : {}), ...(source.normalizedUrl ? { normalizedUrl: source.normalizedUrl } : {}), ...(source.publisher ? { publisher: source.publisher } : {}), ...(iso(source.publishedAt) ? { publishedAt: iso(source.publishedAt) } : {}), fetchedAt: snapshot.fetchedAt.toISOString(), contentHash: snapshot.contentHash, excerpt: evidence.excerpt, locator: evidence.locator, stance: evidence.stance, authority: metadataString(source.metadata, 'authority', 'general_public_web'), independentGroupKey: metadataString(source.metadata, 'independentGroupKey', source.normalizedUrl ?? source.id), freshness: evidence.freshness, relevance: evidence.relevance })),
        artifacts: artifactRows.map(({ artifact, version }) => ({ artifactId: artifact.id, artifactType: artifact.artifactType, versionId: version.id, versionNo: version.versionNo, status: version.status, payload: version.payload, evidenceRefs: version.evidenceRefs })),
        feedback: approvalRows.filter((row) => row.comment).map((row) => ({ feedbackType: 'action_card_changes_requested' as const, aggregateId: row.actionCardId ?? row.artifactVersionId ?? row.id, ...(row.artifactVersionId ? { artifactVersionId: row.artifactVersionId } : {}), comment: row.comment ?? undefined, userId: row.decidedBy ?? row.requestedBy ?? mission.createdBy, createdAt: (row.decidedAt ?? row.requestedAt).toISOString() })),
        openQuestions: claimRows.filter((row) => row.status === 'unknown').map((row) => ({ question: row.statement, impact: row.impactLevel, aggregateId: row.id })),
        execution: { skillKey: input.skillKey, objective: input.objective, outputLanguage: input.outputLanguage, toolPermissions: input.toolPermissions, budgetRemaining: mission.budgetConfig, correlationId },
      };
    });
  }
}
