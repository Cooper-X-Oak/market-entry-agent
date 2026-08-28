import { describe, expect, it } from 'vitest';
import { assertTenant, budgetState, can, requirePermission } from '../index.js';

const budget = { maxTargets: 40, maxContactPaths: 160, maxSearchCalls: 80, maxBrowserPages: 120, maxAgentRuns: 200, maxModelTokens: 1_000_000, weeklyRefreshTargets: 20 };

describe('authorization policy', () => {
  it('keeps full export and workspace management owner-only', () => {
    expect(can('owner', 'export:all')).toBe(true);
    expect(can('editor', 'export:all')).toBe(false);
    expect(can('viewer', 'mission:write')).toBe(false);
    expect(() => requirePermission('viewer', 'action:approve')).toThrow(/lacks action:approve/);
  });

  it('blocks cross-tenant resource access', () => {
    expect(() => assertTenant('tenant-a', 'tenant-b')).toThrow(/Cross-tenant/);
  });
});

describe('budget policy', () => {
  it('warns at eighty percent and exhausts at one hundred percent', () => {
    expect(budgetState(budget, { searchCalls: 64, browserPages: 0, agentRuns: 0, modelTokens: 0, targets: 0, contactPaths: 0 }).state).toBe('warning');
    const exhausted = budgetState(budget, { searchCalls: 81, browserPages: 120, agentRuns: 0, modelTokens: 0, targets: 0, contactPaths: 0 });
    expect(exhausted.state).toBe('exhausted');
    expect(exhausted.exhausted).toEqual(expect.arrayContaining(['searchCalls', 'browserPages']));
  });
});
