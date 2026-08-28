import type { BudgetConfig, TenantRole } from '@imea/contracts';
import { DomainError } from '@imea/domain';

export type Permission = 'workspace:manage' | 'mission:read' | 'mission:write' | 'route:approve' | 'action:approve' | 'interaction:write' | 'export:approved' | 'export:all' | 'run:read';

const permissionsByRole: Record<TenantRole, ReadonlySet<Permission>> = {
  owner: new Set(['workspace:manage', 'mission:read', 'mission:write', 'route:approve', 'action:approve', 'interaction:write', 'export:approved', 'export:all', 'run:read']),
  editor: new Set(['mission:read', 'mission:write', 'route:approve', 'action:approve', 'interaction:write', 'export:approved', 'run:read']),
  viewer: new Set(['mission:read', 'export:approved']),
};

export function can(role: TenantRole, permission: Permission): boolean {
  return permissionsByRole[role].has(permission);
}

export function requirePermission(role: TenantRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new DomainError({ code: 'AUTH_PERMISSION_DENIED', message: `Role ${role} lacks ${permission}` });
  }
}

export interface BudgetUsage {
  searchCalls: number;
  browserPages: number;
  agentRuns: number;
  modelTokens: number;
  targets: number;
  contactPaths: number;
}

export type BudgetState = 'available' | 'warning' | 'exhausted';

export function budgetState(config: BudgetConfig, usage: BudgetUsage): { state: BudgetState; maximumRatio: number; exhausted: string[] } {
  const ratios: Record<string, number> = {
    searchCalls: usage.searchCalls / config.maxSearchCalls,
    browserPages: usage.browserPages / config.maxBrowserPages,
    agentRuns: usage.agentRuns / config.maxAgentRuns,
    modelTokens: usage.modelTokens / config.maxModelTokens,
    targets: usage.targets / config.maxTargets,
    contactPaths: usage.contactPaths / config.maxContactPaths,
  };
  const exhausted = Object.entries(ratios).filter(([, ratio]) => ratio >= 1).map(([name]) => name);
  const maximumRatio = Math.max(...Object.values(ratios), 0);
  return { state: exhausted.length > 0 ? 'exhausted' : maximumRatio >= 0.8 ? 'warning' : 'available', maximumRatio, exhausted };
}

export function assertTenant(currentTenantId: string, resourceTenantId: string): void {
  if (currentTenantId !== resourceTenantId) {
    throw new DomainError({ code: 'AUTH_PERMISSION_DENIED', message: 'Cross-tenant access denied' });
  }
}
