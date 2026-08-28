import { z } from 'zod';
import { actorRefSchema, timestampSchema, uuidSchema, type ActorRef } from './common.js';

export const aggregateTypeSchema = z.enum([
  'mission', 'artifact', 'market_route', 'opportunity', 'contact_point',
  'action_card', 'interaction', 'refresh', 'source', 'claim', 'entity', 'agent_run',
]);

export const domainEventTypeSchema = z.enum([
  'mission.created.v1', 'mission.started.v1', 'mission.stage_changed.v1', 'mission.paused.v1',
  'mission.resumed.v1', 'mission.budget_review_requested.v1', 'mission.budget_updated.v1',
  'mission.activated.v1', 'mission.completed.v1', 'mission.failed.v1', 'mission.updated.v1', 'mission.exported.v1',
  'artifact.version_proposed.v1', 'artifact.version_accepted.v1', 'artifact.changes_requested.v1',
  'market_route.proposed.v1', 'market_route.approved.v1', 'market_route.deprioritized.v1',
  'opportunity.created.v1', 'opportunity.updated.v1', 'opportunity.state_transitioned.v1', 'opportunity.scored.v1',
  'opportunity.paused.v1', 'opportunity.resumed.v1', 'opportunity.closed.v1',
  'contact_point.discovered.v1', 'contact_point.evidence_linked.v1',
  'contact_point.verification_completed.v1', 'contact_point.manually_confirmed.v1',
  'contact_point.marked_stale.v1',
  'action_card.version_created.v1', 'action_card.review_requested.v1',
  'action_card.changes_requested.v1', 'action_card.approved.v1', 'action_card.executed.v1',
  'interaction.recorded.v1', 'interaction.interpreted.v1', 'interaction.claim_created.v1',
  'interaction.contact_updated.v1', 'interaction.route_updated.v1',
  'interaction.opportunity_transitioned.v1',
  'refresh.started.v1', 'refresh.source_changed.v1', 'refresh.contact_reverified.v1',
  'refresh.proposal_created.v1', 'refresh.proposal_accepted.v1', 'refresh.completed.v1',
  'source.added.v1', 'claim.updated.v1', 'market_route.updated.v1',
  'entity.updated.v1', 'entity.promoted.v1', 'entity.archived.v1',
  'stakeholder.discovered.v1', 'stakeholder.updated.v1',
]);

export const domainEventPayloadSchema = z.object({
  tenantId: uuidSchema,
  missionId: uuidSchema.optional(),
  opportunityId: uuidSchema.optional(),
  aggregateId: uuidSchema,
  actor: actorRefSchema,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  evidenceRefs: z.array(uuidSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  id: string;
  tenantId: string;
  aggregateType: AggregateType;
  aggregateId: string;
  aggregateVersion: number;
  eventType: DomainEventType;
  schemaVersion: number;
  payload: TPayload;
  actor: ActorRef;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
}

export const domainEventSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  aggregateType: aggregateTypeSchema,
  aggregateId: uuidSchema,
  aggregateVersion: z.number().int().positive(),
  eventType: domainEventTypeSchema,
  schemaVersion: z.number().int().positive(),
  payload: domainEventPayloadSchema,
  actor: actorRefSchema,
  correlationId: uuidSchema,
  causationId: uuidSchema.optional(),
  occurredAt: timestampSchema,
});

export const missionStreamEventSchema = z.object({
  id: uuidSchema,
  type: domainEventTypeSchema,
  missionId: uuidSchema,
  opportunityId: uuidSchema.optional(),
  occurredAt: timestampSchema,
  readModelVersion: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
});

export type AggregateType = z.infer<typeof aggregateTypeSchema>;
export type DomainEventType = z.infer<typeof domainEventTypeSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventPayload = z.infer<typeof domainEventPayloadSchema>;
export type MissionStreamEvent = z.infer<typeof missionStreamEventSchema>;
