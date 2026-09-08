import type { Database } from './client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
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

interface AmbientTransaction {
  context: TransactionContext;
  transaction: DatabaseTransaction;
}

const ambientTransaction = new AsyncLocalStorage<AmbientTransaction>();

export class TransactionManager {
  constructor(private readonly db: Database) {}

  async run<T>(context: TransactionContext | string, work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    const resolved: TransactionContext = typeof context === 'string'
      ? { tenantId: context, actor: { type: 'system', id: 'legacy' }, correlationId: randomUUID() }
      : context;
    const ambient = ambientTransaction.getStore();
    if (ambient) {
      if (ambient.context.tenantId !== resolved.tenantId) throw new Error('Cross-tenant nested transaction is not allowed');
      await this.applyContext(ambient.transaction, resolved);
      return work(ambient.transaction);
    }
    return this.db.transaction(async (transaction) => {
      await this.applyContext(transaction, resolved);
      return ambientTransaction.run({ context: resolved, transaction }, () => work(transaction));
    });
  }

  async independent<T>(context: TransactionContext | string, work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return ambientTransaction.exit(() => this.run(context, work));
  }

  private async applyContext(transaction: DatabaseTransaction, context: TransactionContext): Promise<void> {
    await transaction.execute(sql`select set_config('app.tenant_id', ${context.tenantId}, true)`);
    await transaction.execute(sql`select set_config('app.actor_type', ${context.actor.type}, true)`);
    await transaction.execute(sql`select set_config('app.actor_id', ${context.actor.id ?? ''}, true)`);
    await transaction.execute(sql`select set_config('app.correlation_id', ${context.correlationId}, true)`);
  }
}
