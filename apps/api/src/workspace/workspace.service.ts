import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { TenantRole } from '@imea/contracts';
import type { Database, TransactionManager } from '@imea/database';
import { tenantMembers, tenants, users } from '@imea/database';
import { DomainError } from '@imea/domain';
import { requirePermission } from '@imea/policies';
import type { AuthContext } from '../common/auth-context.js';
import { DATABASE, TRANSACTION_MANAGER } from '../tokens.js';

@Injectable()
export class WorkspaceService {
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(TRANSACTION_MANAGER) private readonly transactions: TransactionManager) {}

  async get(auth: AuthContext) {
    const [workspace] = await this.transactions.run(auth.tenantId, (tx) => tx.select().from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1));
    if (!workspace) throw new DomainError({ code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' });
    return workspace;
  }

  async update(auth: AuthContext, input: { name?: string }) {
    requirePermission(auth.role, 'workspace:manage');
    const [workspace] = await this.transactions.run(auth.tenantId, (tx) => tx.update(tenants).set({ ...input, updatedAt: new Date() }).where(eq(tenants.id, auth.tenantId)).returning());
    return workspace;
  }

  async members(auth: AuthContext) {
    return this.transactions.run(auth.tenantId, (tx) => tx.select({ userId: users.id, email: users.email, displayName: users.displayName, role: tenantMembers.role, status: tenantMembers.status, createdAt: tenantMembers.createdAt }).from(tenantMembers).innerJoin(users, eq(users.id, tenantMembers.userId)).where(eq(tenantMembers.tenantId, auth.tenantId)));
  }

  async addMember(auth: AuthContext, input: { email: string; role: TenantRole }) {
    requirePermission(auth.role, 'workspace:manage');
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
    if (!user) throw new DomainError({ code: 'WORKSPACE_MEMBER_NOT_FOUND', message: 'User must register before being added to a workspace' });
    const [member] = await this.transactions.run(auth.tenantId, (tx) => tx.insert(tenantMembers).values({ tenantId: auth.tenantId, userId: user.id, role: input.role, status: 'active' }).onConflictDoUpdate({ target: [tenantMembers.tenantId, tenantMembers.userId], set: { role: input.role, status: 'active' } }).returning());
    return member;
  }

  async updateMember(auth: AuthContext, memberId: string, input: { role?: TenantRole; status?: 'active' | 'invited' | 'suspended' }) {
    requirePermission(auth.role, 'workspace:manage');
    const [member] = await this.transactions.run(auth.tenantId, (tx) => tx.update(tenantMembers).set(input).where(and(eq(tenantMembers.tenantId, auth.tenantId), eq(tenantMembers.userId, memberId))).returning());
    if (!member) throw new DomainError({ code: 'WORKSPACE_MEMBER_NOT_FOUND', message: 'Workspace member not found' });
    return member;
  }
}
