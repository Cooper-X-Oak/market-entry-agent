import { Controller, Get, Inject } from '@nestjs/common';
import type { Database } from '@imea/database';
import type { ObjectStorageConnector } from '@imea/connectors';
import type { TemporalGateway } from '@imea/workflows';
import { sql } from 'drizzle-orm';
import { Public } from './common/auth-context.js';
import { DATABASE, OBJECT_STORAGE, TEMPORAL_GATEWAY } from './tokens.js';

@Controller()
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageConnector, @Inject(TEMPORAL_GATEWAY) private readonly temporal: TemporalGateway) {}
  @Public() @Get('health') async health() { await this.db.execute(sql`select 1`); return { status: 'ok', service: 'api', timestamp: new Date().toISOString() }; }
  @Public() @Get('ready') async ready() { await Promise.all([this.db.execute(sql`select 1`), this.storage.health(), this.temporal.health()]); return { status: 'ready', service: 'api', dependencies: { postgres: 'ready', objectStorage: 'ready', temporal: 'ready' }, timestamp: new Date().toISOString() }; }
}
