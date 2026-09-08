import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabaseClient, type DatabaseClient } from '@imea/database';

/** Opt-in endpoint is fixed to the dedicated, loopback-only acceptance container.
 * Never reads DATABASE_URL. Each run owns a fresh database; no cleanup of old data.
 */
export async function isolatedDatabase(): Promise<{ database: DatabaseClient; url: string; stop: () => Promise<unknown> }> {
  if (process.env.IMEA_ISOLATED_REMOTE !== '1') {
    const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').withLabels({ 'imea.scope': 'module-correction-isolated' }).start();
    return { database: createDatabaseClient(container.getConnectionUri(), 8), url: container.getConnectionUri(), stop: () => container.stop() };
  }
  const base = 'postgres://acceptance:isolated-acceptance-only@127.0.0.1:55432/';
  const admin = createDatabaseClient(`${base}imea_a10_isolated`, 1);
  const name = `a10_${crypto.randomUUID().replaceAll('-', '')}`;
  try {
    const [identity] = await admin.sql`select current_user as username, current_database() as db`;
    if (identity?.username !== 'acceptance' || identity.db !== 'imea_a10_isolated') throw new Error('Isolated database identity mismatch');
    await admin.sql.unsafe(`CREATE DATABASE ${name}`);
  } finally { await admin.close(); }
  return { database: createDatabaseClient(`${base}${name}`, 8), url: `${base}${name}`, stop: async () => {} };
}
