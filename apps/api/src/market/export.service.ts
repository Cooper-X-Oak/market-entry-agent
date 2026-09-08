import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import JSZip from 'jszip';
import {
  actionCardEvidenceLinks,
  agentRuns,
  claimEvidenceLinks,
  actionCards,
  claims,
  contactPoints,
  domainEvents,
  DomainEventWriter,
  entities,
  entityRelationships,
  evidenceItems,
  marketRoutes,
  missionEntities,
  missionProgressReadModel,
  missionSources,
  missions,
  opportunities,
  routeEvidenceLinks,
  sourceSnapshots,
  sources,
  targetAssessmentEvidenceLinks,
  targetAssessments,
  timelineReadModel,
  type TransactionManager,
} from '@imea/database';
import { DomainError } from '@imea/domain';
import { requirePermission } from '@imea/policies';
import type { AuthContext } from '../common/auth-context.js';
import { TRANSACTION_MANAGER } from '../tokens.js';

function csv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const headers = columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const encode = (value: unknown): string => {
    let text: string;
    if (value === null || value === undefined) text = '';
    else if (typeof value === 'string') text = value;
    else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') text = value.toString();
    else text = JSON.stringify(value) ?? '';
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `${headers.map(encode).join(',')}\n${rows.map((row) => headers.map((header) => encode(row[header])).join(',')).join('\n')}\n`;
}

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'mission';
}

function markdownActionCard(row: { actionCard: typeof actionCards.$inferSelect; opportunity: typeof opportunities.$inferSelect }): string {
  const card = row.actionCard;
  const opportunity = row.opportunity;
  if (card.cardType === 'research') {
    return `# ${opportunity.title}\n\n- Card Type: Research\n- Status: ${card.status}\n- Priority: ${opportunity.priority}\n- Target Role: ${card.targetRoleLabel}\n\n## Research Objective\n\n${card.objective}\n\n## Why This Research Matters\n\n${card.contactReason}\n\n## Current Hypothesis\n\n${card.valueHypothesis}\n\n## Unknowns\n\n${JSON.stringify(card.unknowns, null, 2)}\n\n## Public Research Plan\n\n${JSON.stringify(card.researchPlan, null, 2)}\n\n## Completion Signals\n\n${JSON.stringify(card.completionSignals, null, 2)}\n\n## Evidence\n\nSee action-card-evidence-links.csv and evidence-index.csv in the parent mission export.\n`;
  }
  return `# ${opportunity.title}\n\n## Opportunity Summary\n\n- Status: ${opportunity.status}\n- Priority: ${opportunity.priority}\n- Score: ${opportunity.score}\n- Next Action: ${JSON.stringify(opportunity.nextAction)}\n\n## Target Organization\n\n${opportunity.organizationId}\n\n## Stakeholder\n\n${card.stakeholderInterest}\n\n## Contact Paths\n\n- Channel: ${card.channel}\n- Primary: ${card.primaryContactPointId}\n- Backup: ${card.backupContactPointId ?? 'Unknown'}\n\n## Why Contact\n\n${card.contactReason}\n\n## Stakeholder Interest\n\n${card.stakeholderInterest}\n\n## Value Hypothesis\n\n${card.valueHypothesis}\n\n## First Contact Objective\n\n${card.objective}\n\n## Message Templates\n\n### Email Subject\n\n${card.emailSubject ?? ''}\n\n### Email Body\n\n${card.emailBody ?? ''}\n\n### Social Message\n\n${card.socialMessage ?? ''}\n\n### Call Opening\n\n${card.callOpening ?? ''}\n\n## Attachments\n\n${JSON.stringify(card.attachmentsRequired, null, 2)}\n\n## Follow Up Plan\n\n${JSON.stringify(card.followUpPlan, null, 2)}\n\n## Success Signals\n\n${JSON.stringify(card.successSignals, null, 2)}\n\n## Evidence\n\nEvidence is indexed in the parent mission export and linked through opportunity and contact records.\n\n## Unknowns\n\n${JSON.stringify(card.completionSignals, null, 2)}\n`;
}

@Injectable()
export class MissionExportService {
  private readonly events = new DomainEventWriter();

  constructor(@Inject(TRANSACTION_MANAGER) private readonly transactions: TransactionManager) {}

  async create(auth: AuthContext, missionId: string): Promise<{ filename: string; bytes: Buffer }> {
    requirePermission(auth.role, 'export:all');
    const [mission] = await this.transactions.run(auth.tenantId, (tx) => tx.select().from(missions).where(and(eq(missions.tenantId, auth.tenantId), eq(missions.id, missionId))).limit(1));
    if (!mission) throw new DomainError({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });

    const [missionSourceRows, sourceRows, snapshotRows, claimRows, routeRows, routeEvidenceRows, entityRows, targetAssessmentRows, targetEvidenceRows, relationshipRows, contactRows, opportunityRows, cardRows, actionCardEvidenceRows, evidenceRows, eventRows, timelineRows, progressRows] = await this.transactions.run(auth.tenantId, (tx) => Promise.all([
      tx.select().from(missionSources).where(and(eq(missionSources.tenantId, auth.tenantId), eq(missionSources.missionId, missionId))),
      tx.select().from(sources).where(and(eq(sources.tenantId, auth.tenantId), eq(sources.missionId, missionId))),
      tx.select({ sourceId: sources.id, snapshot: sourceSnapshots }).from(sourceSnapshots).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(sources.tenantId, auth.tenantId), eq(sources.missionId, missionId))),
      tx.select().from(claims).where(and(eq(claims.tenantId, auth.tenantId), eq(claims.missionId, missionId))),
      tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, auth.tenantId), eq(marketRoutes.missionId, missionId))),
      tx.select().from(routeEvidenceLinks).where(and(eq(routeEvidenceLinks.tenantId, auth.tenantId), eq(routeEvidenceLinks.missionId, missionId))),
      tx.select({ entity: entities, mission: missionEntities }).from(missionEntities).innerJoin(entities, eq(entities.id, missionEntities.entityId)).where(and(eq(entities.tenantId, auth.tenantId), eq(missionEntities.missionId, missionId))),
      tx.select().from(targetAssessments).where(and(eq(targetAssessments.tenantId, auth.tenantId), eq(targetAssessments.missionId, missionId))),
      tx.select({ link: targetAssessmentEvidenceLinks }).from(targetAssessmentEvidenceLinks).innerJoin(targetAssessments, eq(targetAssessments.id, targetAssessmentEvidenceLinks.targetAssessmentId)).where(and(eq(targetAssessments.tenantId, auth.tenantId), eq(targetAssessments.missionId, missionId))),
      tx.select().from(entityRelationships).where(and(eq(entityRelationships.tenantId, auth.tenantId), eq(entityRelationships.missionId, missionId))),
      tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId))),
      tx.select().from(opportunities).where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.missionId, missionId))),
      tx.select({ actionCard: actionCards, opportunity: opportunities }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(and(eq(actionCards.tenantId, auth.tenantId), eq(opportunities.missionId, missionId))),
      tx.select({ link: actionCardEvidenceLinks }).from(actionCardEvidenceLinks).innerJoin(actionCards, eq(actionCards.id, actionCardEvidenceLinks.actionCardId)).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(and(eq(actionCards.tenantId, auth.tenantId), eq(opportunities.missionId, missionId))),
      tx.select({ evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(evidenceItems).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(evidenceItems.tenantId, auth.tenantId), eq(evidenceItems.missionId, missionId))),
      tx.select().from(domainEvents).where(and(eq(domainEvents.tenantId, auth.tenantId), sql`${domainEvents.payload}->>'missionId' = ${missionId}`)),
      tx.select().from(timelineReadModel).where(and(eq(timelineReadModel.tenantId, auth.tenantId), eq(timelineReadModel.missionId, missionId))),
      tx.select().from(missionProgressReadModel).where(and(eq(missionProgressReadModel.tenantId, auth.tenantId), eq(missionProgressReadModel.missionId, missionId))).limit(1),
    ]));

    const [claimLinks, runRows] = await this.transactions.run(auth.tenantId, tx => Promise.all([
      tx.select({ link: claimEvidenceLinks }).from(claimEvidenceLinks).innerJoin(claims, eq(claims.id, claimEvidenceLinks.claimId)).where(and(eq(claims.tenantId, auth.tenantId), eq(claims.missionId, missionId))),
      tx.select({ id: agentRuns.id, status: agentRuns.status, skillKey: agentRuns.skillKey, modelProvider: agentRuns.modelProvider, modelName: agentRuns.modelName }).from(agentRuns).where(and(eq(agentRuns.tenantId, auth.tenantId), eq(agentRuns.missionId, missionId))),
    ]));
    const zip = new JSZip();
    zip.file('mission.json', JSON.stringify(mission, null, 2));
    zip.file('mission-sources.json', JSON.stringify(missionSourceRows, null, 2));
    zip.file('sources.json', JSON.stringify(sourceRows, null, 2));
    zip.file('source-snapshots.json', JSON.stringify(snapshotRows.map(({ snapshot }) => snapshot), null, 2));
    zip.file('mission-progress.json', JSON.stringify(progressRows[0] ?? null, null, 2));
    zip.file('metrics.json', JSON.stringify({ approvedRoutes: routeRows.filter((row) => row.status === 'approved').length, targets: entityRows.length, verifiedContacts: contactRows.filter((row) => ['source_confirmed', 'cross_confirmed', 'manually_confirmed'].includes(row.verificationStatus)).length, actionCards: cardRows.length, opportunities: opportunityRows.length }, null, 2));
    zip.file('capability-ledger.csv', csv(claimRows));
    zip.file('claim-evidence-links.csv', csv(claimLinks.map(row => row.link)));
    zip.file('execution-summary.json', JSON.stringify({ contractVersion: 'module-correction-v1', runs: runRows }, null, 2));
    zip.file('market-routes.md', routeRows.map((route) => `# ${route.rank}. ${route.title}\n\n- Type: ${route.routeType}\n- Status: ${route.status}\n- Confidence: ${route.confidence}\n- Entry Difficulty: ${route.entryDifficulty}\n- Resource Intensity: ${route.resourceIntensity}\n\n${route.hypothesis}\n\n## Evidence\n\n${route.evidenceSummary}\n\n## Counter Evidence\n\n${route.counterEvidenceSummary}`).join('\n\n---\n\n'));
    zip.file('route-evidence-links.csv', csv(routeEvidenceRows));
    zip.file('entities.csv', csv(entityRows.map(({ entity, mission: missionEntity }) => ({ ...entity, ...missionEntity }))));
    zip.file('target-assessments.csv', csv(targetAssessmentRows));
    zip.file('target-assessment-evidence-links.csv', csv(targetEvidenceRows.map(({ link }) => link)));
    zip.file('relationships.csv', csv(relationshipRows));
    zip.file('contact-points.csv', csv(contactRows));
    zip.file('opportunities.csv', csv(opportunityRows));
    const cardsFolder = zip.folder('action-cards');
    for (const row of cardRows) cardsFolder?.file(`${slug(row.opportunity.title)}-action-card-v${row.actionCard.versionNo}.md`, markdownActionCard(row));
    zip.file('action-card-evidence-links.csv', csv(actionCardEvidenceRows.map(({ link }) => link)));
    zip.file('evidence-index.csv', csv(evidenceRows.map(({ evidence, snapshot, source }) => ({ evidence_id: evidence.id, stance: evidence.stance, relevance: evidence.relevance, freshness: evidence.freshness, excerpt: evidence.excerpt, locator: evidence.locator, source_url: source.url, source_title: source.title, snapshot_hash: snapshot.contentHash, captured_at: snapshot.fetchedAt }))));
    zip.file('domain-events.json', JSON.stringify(eventRows, null, 2));
    zip.file('timeline.csv', csv(timelineRows));

    const fileNames = Object.values(zip.files).filter((entry) => !entry.dir).map((entry) => entry.name).sort();
    const fileHashes: Record<string, string> = {};
    for (const name of fileNames) fileHashes[name] = createHash('sha256').update(await zip.file(name)!.async('nodebuffer')).digest('hex');
    fileNames.unshift('export-manifest.json');
    zip.file('export-manifest.json', JSON.stringify({ schemaVersion: 3, contractVersion: 'module-correction-v1', businessStatus: mission.status, currentStage: mission.currentStage, workflowId: mission.workflowId, resultKind: mission.status !== 'failed' && entityRows.length && cardRows.length ? 'unreviewed_business_output' : 'diagnostic_only', generatedAt: new Date().toISOString(), tenantId: auth.tenantId, missionId, executionMode: mission.executionMode, files: fileNames, fileHashes, counts: { missionSources: missionSourceRows.length, sources: sourceRows.length, sourceSnapshots: snapshotRows.length, routeEvidenceLinks: routeEvidenceRows.length, targetAssessments: targetAssessmentRows.length, targetAssessmentEvidenceLinks: targetEvidenceRows.length, actionCards: cardRows.length, actionCardEvidenceLinks: actionCardEvidenceRows.length, domainEvents: eventRows.length, timelineEvents: timelineRows.length } }, null, 2));

    await this.transactions.run(auth.tenantId, (tx) => this.events.append(tx, { tenantId: auth.tenantId, aggregateType: 'mission', aggregateId: missionId, eventType: 'mission.exported.v1', actorType: 'user', actorId: auth.userId, payload: { tenantId: auth.tenantId, missionId, aggregateId: missionId, actor: { type: 'user', id: auth.userId }, metadata: { format: 'zip', files: fileNames.length } } }));
    return { filename: `${slug(mission.name)}-full-export.zip`, bytes: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }) };
  }
}
