import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseClient {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
}

export function createDatabaseClient(databaseUrl: string, maxConnections = 10): DatabaseClient {
  const sql = postgres(databaseUrl, { max: maxConnections, prepare: false });
  const db = drizzle(sql, { schema });
  return { db, sql, close: async () => { await sql.end(); } };
}
