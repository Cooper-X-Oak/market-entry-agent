import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { idempotencyRecords, type TransactionManager } from '@imea/database';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { AuthContext } from './auth-context.js';
import { TRANSACTION_MANAGER } from '../tokens.js';

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(TRANSACTION_MANAGER) private readonly transactions: TransactionManager) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method: string; body?: unknown; headers: Record<string, string | string[] | undefined>; routeOptions?: { url?: string }; url: string; auth?: AuthContext }>();
    const auth = request.auth;
    if (request.method === 'GET' || request.method === 'HEAD' || !auth) return next.handle();
    const rawKey = request.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key) return next.handle();
    if (key.length > 200) throw new ConflictException('Idempotency-Key exceeds 200 characters');

    const endpoint = `${request.method} ${request.routeOptions?.url ?? request.url.split('?')[0]}`;
    const requestHash = createHash('sha256').update(`${endpoint}:${stable(request.body ?? null)}`).digest('hex');
    return from(this.transactions.run({ tenantId: auth.tenantId, actor: { type: 'user', id: auth.userId }, correlationId: crypto.randomUUID() }, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${auth.tenantId}:${endpoint}:${key}`}, 0))`);
      const [existing] = await tx.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.tenantId, auth.tenantId), eq(idempotencyRecords.endpoint, endpoint), eq(idempotencyRecords.idempotencyKey, key))).limit(1);
      if (existing && existing.expiresAt > new Date()) {
        if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used with a different request');
        return existing.responseBody;
      }
      if (existing) await tx.delete(idempotencyRecords).where(eq(idempotencyRecords.id, existing.id));
      const data = await lastValueFrom(next.handle());
      await tx.insert(idempotencyRecords).values({ tenantId: auth.tenantId, idempotencyKey: key, endpoint, requestHash, responseStatus: 200, responseBody: data, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      return data;
    }));
  }
}
