import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorRef, DomainEventPayload } from '@imea/contracts';
import { DomainError } from '@imea/domain';
import { domainEvents, outboxEvents } from './schema/index.js';
import type { DatabaseTransaction } from './transaction.js';

export interface AppendEventInput {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  expectedAggregateVersion?: number;
  eventType: string;
  schemaVersion?: number;
  payload: DomainEventPayload;
  actor?: ActorRef;
  actorType?: 'user' | 'agent' | 'system';
  actorId?: string;
  correlationId?: string;
  causationId?: string;
}

export class DomainEventRepository {
  async append(transaction: DatabaseTransaction, input: AppendEventInput) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.aggregateType}:${input.aggregateId}`}, 0))`);
    const [latest] = await transaction
      .select({ aggregateVersion: domainEvents.aggregateVersion })
      .from(domainEvents)
      .where(and(
        eq(domainEvents.tenantId, input.tenantId),
        eq(domainEvents.aggregateType, input.aggregateType),
        eq(domainEvents.aggregateId, input.aggregateId),
      ))
      .orderBy(desc(domainEvents.aggregateVersion))
      .limit(1);
    const previousVersion = latest?.aggregateVersion ?? 0;
    if (input.expectedAggregateVersion !== undefined && input.expectedAggregateVersion !== previousVersion) {
      throw new DomainError({
        code: 'AGGREGATE_VERSION_CONFLICT',
        message: 'Aggregate version does not match the expected version',
        details: { expected: input.expectedAggregateVersion, actual: previousVersion, aggregateType: input.aggregateType, aggregateId: input.aggregateId },
        retryable: true,
      });
    }
    const actor = input.actor ?? { type: input.actorType ?? 'system', ...(input.actorId ? { id: input.actorId } : {}) };
    const [event] = await transaction.insert(domainEvents).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      aggregateVersion: previousVersion + 1,
      eventType: input.eventType,
      schemaVersion: input.schemaVersion ?? 1,
      payload: input.payload,
      actorType: actor.type,
      actorId: actor.id,
      correlationId: input.correlationId ?? randomUUID(),
      causationId: input.causationId,
    }).returning();
    if (!event) throw new Error('Domain event insert returned no row');
    return event;
  }
}

export class OutboxRepository {
  async enqueue(transaction: DatabaseTransaction, event: typeof domainEvents.$inferSelect): Promise<string> {
    const [outbox] = await transaction.insert(outboxEvents).values({
      domainEventId: event.id,
      tenantId: event.tenantId,
    }).onConflictDoNothing().returning({ id: outboxEvents.id });
    if (!outbox) {
      const [existing] = await transaction.select({ id: outboxEvents.id }).from(outboxEvents).where(eq(outboxEvents.domainEventId, event.id)).limit(1);
      if (!existing) throw new Error('Outbox insert returned no row');
      return existing.id;
    }
    return outbox.id;
  }
}

export class DomainEventWriter {
  private readonly events = new DomainEventRepository();
  private readonly outbox = new OutboxRepository();

  async append(transaction: DatabaseTransaction, input: AppendEventInput): Promise<string> {
    const event = await this.events.append(transaction, input);
    await this.outbox.enqueue(transaction, event);
    return event.id;
  }
}
