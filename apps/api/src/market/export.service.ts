import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import JSZip from 'jszip';
import {
  actionCards,
  claims,
  contactPoints,
  DomainEventWriter,
  entities,
  entityRelationships,
  evidenceItems,
  marketRoutes,
  missionEntities,
  missions,
  opportunities,
  sourceSnapshots,
  sources,
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

    const [claimRows, routeRows, entityRows, relationshipRows, contactRows, opportunityRows, cardRows, evidenceRows, timelineRows] = await this.transactions.run(auth.tenantId, (tx) => Promise.all([
      tx.select().from(claims).where(and(eq(claims.tenantId, auth.tenantId), eq(claims.missionId, missionId))),
      tx.select().from(marketRoutes).where(and(eq(marketRoutes.tenantId, auth.tenantId), eq(marketRoutes.missionId, missionId))),
      tx.select({ entity: entities, mission: missionEntities }).from(missionEntities).innerJoin(entities, eq(entities.id, missionEntities.entityId)).where(and(eq(entities.tenantId, auth.tenantId), eq(missionEntities.missionId, missionId))),
      tx.select().from(entityRelationships).where(and(eq(entityRelationships.tenantId, auth.tenantId), eq(entityRelationships.missionId, missionId))),
      tx.select().from(contactPoints).where(and(eq(contactPoints.tenantId, auth.tenantId), eq(contactPoints.missionId, missionId))),
      tx.select().from(opportunities).where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.missionId, missionId))),
      tx.select({ actionCard: actionCards, opportunity: opportunities }).from(actionCards).innerJoin(opportunities, eq(opportunities.id, actionCards.opportunityId)).where(and(eq(actionCards.tenantId, auth.tenantId), eq(opportunities.missionId, missionId))),
      tx.select({ evidence: evidenceItems, snapshot: sourceSnapshots, source: sources }).from(evidenceItems).innerJoin(sourceSnapshots, eq(sourceSnapshots.id, evidenceItems.sourceSnapshotId)).innerJoin(sources, eq(sources.id, sourceSnapshots.sourceId)).where(and(eq(evidenceItems.tenantId, auth.tenantId), eq(evidenceItems.missionId, missionId))),
      tx.select().from(timelineReadModel).where(and(eq(timelineReadModel.tenantId, auth.tenantId), eq(timelineReadModel.missionId, missionId))),
    ]));

    const zip = new JSZip();
    zip.file('mission.json', JSON.stringify(mission, null, 2));
    zip.file('capability-ledger.csv', csv(claimRows));
    zip.file('market-routes.md', routeRows.map((route) => `# ${route.rank}. ${route.title}\n\n- Type: ${route.routeType}\n- Status: ${route.status}\n- Confidence: ${route.confidence}\n- Entry Difficulty: ${route.entryDifficulty}\n- Resource Intensity: ${route.resourceIntensity}\n\n${route.hypothesis}\n\n## Evidence\n\n${route.evidenceSummary}\n\n## Counter Evidence\n\n${route.counterEvidenceSummary}`).join('\n\n---\n\n'));
    zip.file('entities.csv', csv(entityRows.map(({ entity, mission: missionEntity }) => ({ ...entity, ...missionEntity }))));
    zip.file('relationships.csv', csv(relationshipRows));
    zip.file('contact-points.csv', csv(contactRows));
    zip.file('opportunities.csv', csv(opportunityRows));
    const cardsFolder = zip.folder('action-cards');
    for (const row of cardRows) cardsFolder?.file(`${slug(row.opportunity.title)}-action-card-v${row.actionCard.versionNo}.md`, markdownActionCard(row));
    zip.file('evidence-index.csv', csv(evidenceRows.map(({ evidence, snapshot, source }) => ({ evidence_id: evidence.id, stance: evidence.stance, relevance: evidence.relevance, freshness: evidence.freshness, excerpt: evidence.excerpt, locator: evidence.locator, source_url: source.url, source_title: source.title, snapshot_hash: snapshot.contentHash, captured_at: snapshot.fetchedAt }))));
    zip.file('timeline.csv', csv(timelineRows));

    await this.transactions.run(auth.tenantId, (tx) => this.events.append(tx, { tenantId: auth.tenantId, aggregateType: 'mission', aggregateId: missionId, eventType: 'mission.exported.v1', actorType: 'user', actorId: auth.userId, payload: { tenantId: auth.tenantId, missionId, aggregateId: missionId, actor: { type: 'user', id: auth.userId }, metadata: { format: 'zip', files: 9 + cardRows.length } } }));
    return { filename: `${slug(mission.name)}-full-export.zip`, bytes: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }) };
  }
}
