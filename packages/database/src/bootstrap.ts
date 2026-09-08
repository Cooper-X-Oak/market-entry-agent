import { pathToFileURL } from 'node:url';
import { bootstrapDevelopmentIdentity } from './bootstrap-data.js';
import { createDatabaseClient } from './client.js';

export async function bootstrapDevelopmentDatabase(databaseUrl: string, password?: string): Promise<void> {
  const client = createDatabaseClient(databaseUrl, 1);
  try {
    await bootstrapDevelopmentIdentity(client.db, password);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write('Development identity bootstrap requires DATABASE_URL.\n');
    process.exitCode = 1;
  } else {
    try {
      await bootstrapDevelopmentDatabase(databaseUrl, process.env.DEMO_PASSWORD);
      process.stdout.write('Development identity ready. Demo business data was not written.\n');
    } catch {
      process.stderr.write('Development identity bootstrap failed. Check database access and initialization prerequisites.\n');
      process.exitCode = 1;
    }
  }
}
