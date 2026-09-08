import { eq, sql } from 'drizzle-orm';
import type { Database, DatabaseClient } from '@imea/database';
import {
  agentRuns,
  domainEvents,
  missionProgressReadModel,
  outboxEvents,
  projectionCheckpoints,
  projectionFailures,
  runReadModel,
  timelineReadModel,
  toolRuns,
} from '@imea/database';

const CONSUMER_NAME = 'imea-main-projector-v1';
const stageProgress: Record<string, number> = { draft: 0, compiling: 5, ingesting_company_data: 12, researching_capabilities: 20, awaiting_capability_review: 28, researching_routes: 38, awaiting_route_review: 46, researching_ecosystem: 58, researching_targets: 70, awaiting_target_review: 78, researching_contacts: 86, generating_actions: 94, awaiting_action_review: 98, active: 100, completed: 100, failed: 100, awaiting_budget_review: 100 };
const pendingActionByStage: Record<string, string[]> = {
  awaiting_capability_review: ['capability_review'],
  awaiting_route_review: ['market_route_review'],
  awaiting_target_review: ['target_review'],
  awaiting_action_review: ['action_card_review'],
};
const decisionByStage: Record<string, string> = {
  awaiting_capability_review: 'capability_review',
  awaiting_route_review: 'route_review',
  awaiting_target_review: 'target_review',
  awaiting_action_review: 'action_review',
};
const nextActionByStage: Record<string, string> = {
  awaiting_capability_review: '确认企业能力边界',
  awaiting_route_review: '批准至少一条市场进入路线',
  awaiting_target_review: '从 Top 10 中选择 1–3 个目标',
  awaiting_action_review: '核对并批准至少一张 Action Card',
};

interface EventPayload { tenantId: string; missionId?: string; opportunityId?: string; aggregateId: string; actor: { type: string; id?: string }; before?: unknown; after?: unknown; evidenceRefs?: string[]; metadata?: Record<string, unknown> }
interface ClaimedOutbox { outbox_id: string; domain_event_id: string; tenant_id: string; event_type: string; aggregate_type: string; aggregate_id: string; payload: EventPayload; occurred_at: Date }

export class Projector {
  private stopping = false;
  constructor(private readonly client: DatabaseClient, private readonly db: Database) {}

  stop(): void { this.stopping = true; }

  async run(): Promise<void> {
    while (!this.stopping) {
      const count = await this.batch();
      if (count === 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async batch(): Promise<number> {
    const rows = await this.client.sql<ClaimedOutbox[]>`select * from claim_outbox_batch(${CONSUMER_NAME}, 50, 60)`;
    for (const row of rows) await this.process(row);
    return rows.length;
  }

  private async process(claimed: ClaimedOutbox): Promise<void> {
    let notification: Record<string, unknown> | undefined;
    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${claimed.tenant_id}, true)`);
        await tx.execute(sql`select set_config('app.actor_type', 'system', true)`);
        await tx.execute(sql`select set_config('app.actor_id', ${CONSUMER_NAME}, true)`);
        await tx.execute(sql`select set_config('app.correlation_id', ${claimed.domain_event_id}, true)`);
        const [event] = await tx.select().from(domainEvents).where(eq(domainEvents.id, claimed.domain_event_id)).limit(1);
        if (!event) throw new Error(`Claimed event ${claimed.domain_event_id} is not visible in its tenant transaction`);
        await this.project(tx, event);
        await tx.insert(projectionCheckpoints).values({ consumerName: CONSUMER_NAME, lastEventId: event.id, lastOccurredAt: event.occurredAt, processedCount: 1 }).onConflictDoUpdate({
          target: projectionCheckpoints.consumerName,
          set: { lastEventId: event.id, lastOccurredAt: event.occurredAt, processedCount: sql`${projectionCheckpoints.processedCount} + 1`, updatedAt: new Date() },
        });
        await tx.update(outboxEvents).set({ status: 'published', publishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastError: null }).where(eq(outboxEvents.id, claimed.outbox_id));
        const payload = event.payload as unknown as EventPayload;
        if (payload.missionId) notification = {
          id: event.id,
          type: event.eventType,
          missionId: payload.missionId,
          ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
          occurredAt: event.occurredAt.toISOString(),
          readModelVersion: event.aggregateVersion,
          payload: event.payload,
        };
      });
      if (notification) await this.client.sql.notify('mission_events', JSON.stringify(notification));
    } catch (error) {
      await this.recordFailure(claimed, error);
    }
  }

  private async recordFailure(claimed: ClaimedOutbox, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${claimed.tenant_id}, true)`);
      await tx.execute(sql`select set_config('app.actor_type', 'system', true)`);
      await tx.execute(sql`select set_config('app.actor_id', ${CONSUMER_NAME}, true)`);
      await tx.execute(sql`select set_config('app.correlation_id', ${claimed.domain_event_id}, true)`);
      const [outbox] = await tx.select().from(outboxEvents).where(eq(outboxEvents.id, claimed.outbox_id)).limit(1);
      const attempts = outbox?.attempts ?? 1;
      const nextRetryAt = new Date(Date.now() + Math.min(300_000, 2 ** attempts * 1_000));
      await tx.insert(projectionFailures).values({ consumerName: CONSUMER_NAME, eventId: claimed.domain_event_id, tenantId: claimed.tenant_id, attempts, errorCode: 'PROJECTION_FAILED', errorMessage: message, nextRetryAt }).onConflictDoUpdate({
        target: [projectionFailures.consumerName, projectionFailures.eventId],
        set: { attempts, errorCode: 'PROJECTION_FAILED', errorMessage: message, nextRetryAt, updatedAt: new Date() },
      });
      await tx.update(outboxEvents).set({ status: attempts >= 10 ? 'failed' : 'pending', lastError: message, nextAttemptAt: nextRetryAt, leaseOwner: null, leaseExpiresAt: null }).where(eq(outboxEvents.id, claimed.outbox_id));
    });
  }

  private async project(db: Database, event: typeof domainEvents.$inferSelect): Promise<void> {
    const payload = event.payload as unknown as EventPayload;
    if (!payload.missionId) return;
    await db.insert(timelineReadModel).values({
      eventId: event.id,
      tenantId: event.tenantId,
      missionId: payload.missionId,
      eventType: event.eventType,
      actorType: event.actorType,
      actorDisplayName: event.actorId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      causationId: event.causationId,
      aggregateVersion: event.aggregateVersion,
      schemaVersion: event.schemaVersion,
      title: event.eventType,
      summary: this.summary(event.eventType, payload),
      evidenceRefs: payload.evidenceRefs ?? [],
      occurredAt: event.occurredAt,
    }).onConflictDoNothing();

    await db.execute(sql`
      INSERT INTO mission_dashboard_read_model (
        mission_id, tenant_id, mission_name, company_name, target_countries, status, current_stage,
        approved_route_count, target_count, verified_contact_count, action_card_count,
        pending_approval_count, high_priority_opportunity_count, weekly_interaction_count,
        total_cost_amount, updated_at
      )
      SELECT m.id, m.tenant_id, m.name, m.company_name, m.target_countries, m.status::text, m.current_stage::text,
        (SELECT count(*) FROM market_routes r WHERE r.mission_id=m.id AND r.status='approved'),
        (SELECT count(*) FROM mission_entities me WHERE me.mission_id=m.id AND me.target_status IN ('target','high_priority')),
        (SELECT count(*) FROM contact_points c WHERE c.mission_id=m.id AND c.verification_status IN ('source_confirmed','cross_confirmed','manually_confirmed')),
        (SELECT count(*) FROM action_cards ac JOIN opportunities o ON o.id=ac.opportunity_id WHERE o.mission_id=m.id),
        (SELECT count(*) FROM approvals a WHERE a.mission_id=m.id AND a.status='pending'),
        (SELECT count(*) FROM opportunities o WHERE o.mission_id=m.id AND o.priority IN ('high','critical')),
        (SELECT count(*) FROM interactions i WHERE i.mission_id=m.id AND i.occurred_at >= now() - interval '7 days'),
        (SELECT CASE WHEN count(*) FILTER (WHERE ar.cost_amount IS NULL) > 0 THEN NULL ELSE coalesce(sum(ar.cost_amount),0) END FROM agent_runs ar WHERE ar.mission_id=m.id), now()
      FROM missions m WHERE m.id=${payload.missionId}
      ON CONFLICT (mission_id) DO UPDATE SET
        status=EXCLUDED.status, current_stage=EXCLUDED.current_stage, approved_route_count=EXCLUDED.approved_route_count,
        target_count=EXCLUDED.target_count, verified_contact_count=EXCLUDED.verified_contact_count,
        action_card_count=EXCLUDED.action_card_count, pending_approval_count=EXCLUDED.pending_approval_count,
        high_priority_opportunity_count=EXCLUDED.high_priority_opportunity_count, weekly_interaction_count=EXCLUDED.weekly_interaction_count,
        total_cost_amount=EXCLUDED.total_cost_amount, updated_at=now()
    `);

    const [progress] = await db.execute<{ current_stage: string; execution_mode: string; total: number; action_ready: number; active: number; closed: number; workflow_run_id: string | null; candidate_target_count: number; selected_target_count: number; approved_action_card_count: number }>(sql`
      SELECT m.current_stage::text, m.execution_mode,
        (SELECT count(*)::int FROM opportunities o WHERE o.mission_id=m.id) AS total,
        (SELECT count(*)::int FROM opportunities o WHERE o.mission_id=m.id AND o.status IN ('action_ready','approved')) AS action_ready,
        (SELECT count(*)::int FROM opportunities o WHERE o.mission_id=m.id AND o.status IN ('contacted','responded','qualified','meeting','supplier_registration','sample','quotation')) AS active,
        (SELECT count(*)::int FROM opportunities o WHERE o.mission_id=m.id AND o.status IN ('won','lost','archived')) AS closed,
        (SELECT wi.run_id FROM workflow_instances wi WHERE wi.mission_id=m.id AND wi.workflow_type='mission' ORDER BY wi.updated_at DESC LIMIT 1) AS workflow_run_id,
        (SELECT count(*)::int FROM target_assessments ta WHERE ta.mission_id=m.id AND ta.gate_passed=true AND ta.rank <= 10) AS candidate_target_count,
        (SELECT count(*)::int FROM mission_entities me WHERE me.mission_id=m.id AND me.target_status='high_priority') AS selected_target_count,
        (SELECT count(*)::int FROM action_cards ac JOIN opportunities o ON o.id=ac.opportunity_id WHERE o.mission_id=m.id AND ac.status IN ('approved','exported','executed','completed')) AS approved_action_card_count
      FROM missions m WHERE m.id=${payload.missionId}
    `);
    const stage = progress?.current_stage ?? 'draft';
    await db.insert(missionProgressReadModel).values({
      missionId: payload.missionId,
      tenantId: event.tenantId,
      stage,
      stageProgress: stageProgress[stage] ?? 0,
      completedSteps: [], runningSteps: [], pendingSteps: [], failedSteps: [], budgetUsage: {},
      pendingUserActions: pendingActionByStage[stage] ?? [],
      executionMode: progress?.execution_mode ?? 'live',
      currentDecision: decisionByStage[stage] ?? null,
      nextAction: nextActionByStage[stage] ?? null,
      candidateTargetCount: progress?.candidate_target_count ?? 0,
      selectedTargetCount: progress?.selected_target_count ?? 0,
      approvedActionCardCount: progress?.approved_action_card_count ?? 0,
      workflowRunId: progress?.workflow_run_id,
      readModelVersion: event.aggregateVersion,
      childOpportunityTotal: progress?.total ?? 0,
      childOpportunityActionReady: progress?.action_ready ?? 0,
      childOpportunityActive: progress?.active ?? 0,
      childOpportunityClosed: progress?.closed ?? 0,
      lastEventId: event.id,
    }).onConflictDoUpdate({ target: missionProgressReadModel.missionId, set: {
      stage, stageProgress: stageProgress[stage] ?? 0,
      pendingUserActions: pendingActionByStage[stage] ?? [],
      executionMode: progress?.execution_mode ?? 'live',
      currentDecision: decisionByStage[stage] ?? null,
      nextAction: nextActionByStage[stage] ?? null,
      candidateTargetCount: progress?.candidate_target_count ?? 0,
      selectedTargetCount: progress?.selected_target_count ?? 0,
      approvedActionCardCount: progress?.approved_action_card_count ?? 0,
      workflowRunId: progress?.workflow_run_id,
      readModelVersion: event.aggregateVersion,
      childOpportunityTotal: progress?.total ?? 0,
      childOpportunityActionReady: progress?.action_ready ?? 0,
      childOpportunityActive: progress?.active ?? 0,
      childOpportunityClosed: progress?.closed ?? 0,
      lastEventId: event.id,
      updatedAt: new Date(),
    } });
    await this.projectRuns(db, event.tenantId, payload.missionId);
  }

  private async projectRuns(db: Database, tenantId: string, missionId: string): Promise<void> {
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.missionId, missionId));
    for (const run of runs) {
      const tools = await db.select().from(toolRuns).where(eq(toolRuns.agentRunId, run.id));
      await db.insert(runReadModel).values({
        runId: run.id, tenantId, missionId, runType: run.activityType, skillKey: run.skillKey, status: run.status,
        modelName: run.modelName, contextVersion: run.contextVersion, inputContextHash: run.inputContextHash,
        evidenceItemIds: run.evidenceItemIds, toolRuns: tools, inputTokens: run.inputTokens, outputTokens: run.outputTokens,
        costAmount: run.costAmount, traceId: run.traceId, startedAt: run.startedAt, completedAt: run.completedAt,
        errorMessage: run.errorMessage,
      }).onConflictDoUpdate({ target: runReadModel.runId, set: {
        status: run.status, contextVersion: run.contextVersion, inputContextHash: run.inputContextHash,
        evidenceItemIds: run.evidenceItemIds, toolRuns: tools, inputTokens: run.inputTokens, outputTokens: run.outputTokens,
        costAmount: run.costAmount, completedAt: run.completedAt, errorMessage: run.errorMessage,
      } });
    }
  }

  private summary(eventType: string, payload: EventPayload): string {
    const after = payload.after && typeof payload.after === 'object' ? JSON.stringify(payload.after).slice(0, 500) : '';
    return after ? `${eventType}: ${after}` : eventType;
  }
}
