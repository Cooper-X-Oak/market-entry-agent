import type { Database } from './client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ActorRef } from '@imea/contracts';

export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TransactionContext {
  tenantId: string;
  actor: ActorRef;
  correlationId: string;
  causationId?: string;
}

export interface TenantTransactionManager {
  run<T>(context: TransactionContext, work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}

export class TransactionManager {
  constructor(private readonly db: Database) {}

  async run<T>(context: TransactionContext | string, work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    const resolved: TransactionContext = typeof context === 'string'
      ? { tenantId: context, actor: { type: 'system', id: 'legacy' }, correlationId: randomUUID() }
      : context;
    return this.db.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('app.tenant_id', ${resolved.tenantId}, true)`);
      await transaction.execute(sql`select set_config('app.actor_type', ${resolved.actor.type}, true)`);
      await transaction.execute(sql`select set_config('app.actor_id', ${resolved.actor.id ?? ''}, true)`);
      await transaction.execute(sql`select set_config('app.correlation_id', ${resolved.correlationId}, true)`);
      return work(transaction);
    });
  }
}
