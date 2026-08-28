import { describe, expect, it } from 'vitest';
import { ConnectorError, createMockConnectorRegistry, enrichConnectorEvidence, evidenceIdForItem, MockConnector, verificationStatusFromFacts } from '../index.js';

const request = { tenantId: '10000000-0000-4000-8000-000000000001', missionId: '10000000-0000-4000-8000-000000000003', operation: 'search', query: 'industrial valves Germany' };

describe('connector contract', () => {
  it('returns deterministic successful fixture results for every registered type', async () => {
    for (const [type, connector] of createMockConnectorRegistry()) {
      const result = await connector.execute({ ...request, operation: type.includes('contact') ? 'verify_contact' : 'search' });
      expect(result.success).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.costAmount).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.items.every((item) => item.metadata.fixture === true)).toBe(true);
    }
  });

  it('can represent an empty result without violating the contract', async () => {
    class EmptyMock extends MockConnector { override execute() { return Promise.resolve({ success: true, items: [], costAmount: 0, durationMs: 0 }); } }
    await expect(new EmptyMock().execute()).resolves.toMatchObject({ success: true, items: [] });
  });

  it('maps verification score bands', () => {
    const base = { formatCheckPassed: true, exactValueListedByOfficialOrganization: false, independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] };
    expect(verificationStatusFromFacts(base)).toBe('format_valid');
    expect(verificationStatusFromFacts({ ...base, exactValueListedByOfficialOrganization: true, exactValueLocatorEvidenceId: '00000000-0000-4000-8000-000000000101' })).toBe('source_confirmed');
    expect(verificationStatusFromFacts({ ...base, independentConfirmationGroups: ['a', 'b'] })).toBe('cross_confirmed');
    expect(verificationStatusFromFacts({ ...base, manualConfirmation: { userId: '00000000-0000-4000-8000-000000000001', confirmedAt: new Date().toISOString() } })).toBe('manually_confirmed');
  });

  it('normalizes every result into raw, source, snapshot, evidence and locator records', () => {
    const rawObjectKey = 'raw/connectors/fixture.json';
    const enriched = enrichConnectorEvidence({ success: true, items: [{ title: 'Official procurement page', url: 'https://buyer.example/procurement', content: 'suppliers@buyer.example', metadata: { authority: 'official_organization', independentGroupKey: 'buyer.example', locator: { selector: '#supplier-email' }, fetchedAt: '2026-08-28T00:00:00.000Z' } }], rawObjectKey, costAmount: 0, durationMs: 1 });
    expect(enriched.evidence).toHaveLength(1);
    expect(enriched.evidence[0]).toMatchObject({ source: { normalizedUrl: 'https://buyer.example/procurement', authority: 'official_organization' }, snapshot: { objectKey: rawObjectKey }, evidence: { locator: { selector: '#supplier-email' } } });
    expect(enriched.items[0]?.metadata.evidenceId).toBe(enriched.evidence[0]?.evidenceId);
    expect(enriched.normalizedOutputs).toHaveLength(1);
  });

  it('uses content-addressed evidence identifiers for idempotent duplicate persistence', () => {
    const item = { title: 'Same page', url: 'https://source.example/page', content: 'same body', metadata: {} };
    expect(evidenceIdForItem(item)).toBe(evidenceIdForItem({ ...item, metadata: { fetchedAt: 'later' } }));
  });

  it.each([
    ['TIMEOUT', true],
    ['RATE_LIMITED', true],
    ['AUTHENTICATION_FAILED', false],
  ])('preserves %s failures with explicit retryability', async (code, retryable) => {
    class FailingConnector extends MockConnector { override execute(): Promise<never> { return Promise.reject(new ConnectorError(code, `${code} fixture`, retryable, { status: code === 'RATE_LIMITED' ? 429 : undefined })); } }
    await expect(new FailingConnector().execute()).rejects.toMatchObject({ code, retryable });
  });

  it('preserves useful evidence for a partial-success response', () => {
    const result = enrichConnectorEvidence({ success: false, items: [{ title: 'Partial result', content: 'One page was collected before timeout.', metadata: { partial: true } }], costAmount: 0, durationMs: 30_000 });
    expect(result.success).toBe(false);
    expect(result.evidence).toHaveLength(1);
    expect(result.normalizedOutputs[0]?.metadata).toMatchObject({ partial: true });
  });
});
