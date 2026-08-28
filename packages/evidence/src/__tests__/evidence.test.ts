import { describe, expect, it } from 'vitest';
import { evidenceCoverage, isFresh, resolveEntity } from '../index.js';

describe('evidence rules', () => {
  it('measures only required conclusions', () => {
    expect(evidenceCoverage([{ key: 'a', required: true, evidenceRefs: ['e1'] }, { key: 'b', required: true, evidenceRefs: [] }, { key: 'c', required: false, evidenceRefs: [] }])).toBe(50);
  });

  it('applies per-type freshness windows', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    expect(isFresh(new Date('2026-06-01T00:00:00Z'), 'direct_contact', now)).toBe(true);
    expect(isFresh(new Date('2026-01-01T00:00:00Z'), 'direct_contact', now)).toBe(false);
  });
});

describe('entity resolution', () => {
  it('merges exact official domains despite legal-suffix variation', () => {
    const result = resolveEntity({ canonicalName: 'RheinWerk Distribution', countryCode: 'DE', website: 'https://rheinwerk.example/about' }, { id: 'entity-1', canonicalName: 'RheinWerk Distribution GmbH', countryCode: 'DE', website: 'https://www.rheinwerk.example' });
    expect(result.decision).toBe('merge');
    expect(result.reasons).toContain('official_domain_match');
  });

  it('creates when no reliable identity field matches', () => {
    expect(resolveEntity({ canonicalName: 'Alpha Valve', countryCode: 'DE' }, { id: 'entity-2', canonicalName: 'Beta Valve', countryCode: 'DE' }).decision).toBe('create');
  });
});
