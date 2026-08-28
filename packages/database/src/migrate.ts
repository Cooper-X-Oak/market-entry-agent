import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabaseClient } from './client.js';

const databaseUrl = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
const dedicatedMigrator = Boolean(process.env.DATABASE_MIGRATOR_URL);
if (!databaseUrl) throw new Error('DATABASE_MIGRATOR_URL is required');
const client = createDatabaseClient(databaseUrl, 1);
try {
  if (dedicatedMigrator && process.env.DATABASE_MIGRATION_SET_ROLE !== 'false') await client.sql`set role imea_owner`;
  await migrate(client.db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
} finally {
  await client.close();
}
