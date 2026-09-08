import { hash } from 'argon2';
import type { Database } from './client.js';
import { tenantMembers, tenants, users } from './schema/index.js';

export const developmentIdentityIds = {
  tenant: '10000000-0000-4000-8000-000000000001',
  user: '10000000-0000-4000-8000-000000000002',
} as const;

/** Creates the development login only; existing identity settings are preserved. */
export async function bootstrapDevelopmentIdentity(database: Database, password = 'Demo123!'): Promise<void> {
  const passwordHash = await hash(password);
  await database.transaction(async (transaction) => {
    await transaction.insert(tenants).values({
      id: developmentIdentityIds.tenant,
      name: 'Demo Industrial Workspace',
      slug: 'demo-industrial',
    }).onConflictDoNothing();
    await transaction.insert(users).values({
      id: developmentIdentityIds.user,
      email: 'owner@demo.local',
      displayName: 'Demo Owner',
      passwordHash,
    }).onConflictDoNothing();
    await transaction.insert(tenantMembers).values({
      tenantId: developmentIdentityIds.tenant,
      userId: developmentIdentityIds.user,
      role: 'owner',
      status: 'active',
    }).onConflictDoNothing();
  });
}
