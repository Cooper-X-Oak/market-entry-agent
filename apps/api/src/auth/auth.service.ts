import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { and, eq, sql } from 'drizzle-orm';
import type { Environment } from '@imea/config';
import type { Database, DatabaseClient } from '@imea/database';
import { tenantMembers, tenants, users } from '@imea/database';
import { DomainError } from '@imea/domain';
import { DATABASE, DATABASE_CLIENT, ENVIRONMENT } from '../tokens.js';

export interface RegisterInput { name: string; workspaceName: string; email: string; password: string }
export interface LoginInput { email: string; password: string }

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(DATABASE_CLIENT) private readonly client: DatabaseClient, @Inject(ENVIRONMENT) private readonly env: Environment, private readonly jwt: JwtService) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, { type: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const slugBase = input.workspaceName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
    const result = await this.db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw new DomainError({ code: 'AUTH_EMAIL_EXISTS', message: 'Email already registered' });
      const [user] = await tx.insert(users).values({ email, displayName: input.name, passwordHash }).returning();
      if (!user) throw new Error('User insert failed');
      const [tenant] = await tx.insert(tenants).values({ name: input.workspaceName, slug: `${slugBase}-${crypto.randomUUID().slice(0, 8)}` }).returning();
      if (!tenant) throw new Error('Tenant insert failed');
      await tx.execute(sql`select set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.insert(tenantMembers).values({ tenantId: tenant.id, userId: user.id, role: 'owner' });
      return { user, tenant, role: 'owner' as const };
    });
    return { ...result, token: await this.sign(result.user.id, result.tenant.id, result.role, result.user.email) };
  }

  async login(input: LoginInput) {
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email.trim().toLowerCase())).limit(1);
    if (!user || !(await verify(user.passwordHash, input.password))) throw new DomainError({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' });
    const [membership] = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.auth_user_id', ${user.id}, true)`);
      return tx.select({ member: tenantMembers, tenant: tenants }).from(tenantMembers).innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId)).where(and(eq(tenantMembers.userId, user.id), eq(tenantMembers.status, 'active'))).limit(1);
    });
    if (!membership) throw new DomainError({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' });
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return { user, ...membership, token: await this.sign(user.id, membership.tenant.id, membership.member.role, user.email) };
  }

  private sign(userId: string, tenantId: string, role: string, email: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, tenantId, role, email }, { secret: this.env.JWT_SECRET, expiresIn: '8h' });
  }
}
