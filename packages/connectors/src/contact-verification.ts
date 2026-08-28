import { resolveMx } from 'node:dns/promises';
import type { ContactVerificationFacts, ContactVerificationStatus } from '@imea/contracts';
import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function verificationStatusFromFacts(facts: ContactVerificationFacts, terminal?: 'stale' | 'invalid'): ContactVerificationStatus {
  if (terminal) return terminal;
  if (facts.manualConfirmation) return 'manually_confirmed';
  const official = facts.exactValueListedByOfficialOrganization && Boolean(facts.exactValueLocatorEvidenceId);
  if ((official && facts.independentConfirmationGroups.length >= 1) || facts.independentConfirmationGroups.length >= 2) return 'cross_confirmed';
  if (official) return 'source_confirmed';
  if (facts.formatCheckPassed || facts.urlReachabilityPassed) return 'format_valid';
  return 'discovered';
}

export class ContactVerificationConnector implements Connector {
  readonly type = 'contact_verification';
  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    const value = typeof request.options?.value === 'string' ? request.options.value.trim() : request.url;
    if (!value) throw new ConnectorError('VALIDATION_ERROR', 'Contact value is required', false);
    const started = Date.now();
    let score = 0;
    const checks: Record<string, boolean> = {};
    if (request.operation === 'normalize') {
      const normalized = value.includes('@') ? value.toLowerCase() : value.replace(/\s+/g, ' ').trim();
      return { success: true, items: [{ content: normalized, metadata: { normalized } }], costAmount: 0, durationMs: Date.now() - started };
    }
    if (emailPattern.test(value)) { score += 10; checks.format = true; }
    if (request.operation === 'validate_mx' || request.operation === 'cross_check_sources') {
      const domain = value.split('@')[1];
      if (domain) {
        try { checks.mx = (await resolveMx(domain)).length > 0; if (checks.mx) score += 15; } catch { checks.mx = false; }
      }
    }
    if (request.operation === 'validate_url') {
      try { const response = await fetch(value, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) }); checks.url = response.ok; if (response.ok) score += 40; } catch { checks.url = false; }
    }
    if (request.options?.officialSource === true) score += 40;
    if (request.options?.officialProcurementSource === true) score += 40;
    if (request.options?.independentSourceCount && Number(request.options.independentSourceCount) >= 2) score += 25;
    if (request.options?.employmentConfirmed === true) score += 20;
    if (request.operation === 'manual_confirm') score += 50;
    score = Math.min(100, score);
    const evidenceId = typeof request.options?.exactValueLocatorEvidenceId === 'string' ? request.options.exactValueLocatorEvidenceId : undefined;
    const facts: ContactVerificationFacts = {
      formatCheckPassed: checks.format === true,
      ...(checks.mx !== undefined ? { mxCheckPassed: checks.mx } : {}),
      ...(checks.url !== undefined ? { urlReachabilityPassed: checks.url } : {}),
      exactValueListedByOfficialOrganization: request.options?.officialSource === true || request.options?.officialProcurementSource === true,
      ...(evidenceId ? { exactValueLocatorEvidenceId: evidenceId } : {}),
      independentConfirmationGroups: Array.isArray(request.options?.independentConfirmationGroups) ? request.options.independentConfirmationGroups.filter((item): item is string => typeof item === 'string') : [],
      employmentConfirmationEvidenceIds: Array.isArray(request.options?.employmentConfirmationEvidenceIds) ? request.options.employmentConfirmationEvidenceIds.filter((item): item is string => typeof item === 'string') : [],
      ...(request.operation === 'manual_confirm' && typeof request.options?.userId === 'string' ? { manualConfirmation: { userId: request.options.userId, confirmedAt: new Date().toISOString(), ...(typeof request.options?.comment === 'string' ? { comment: request.options.comment } : {}) } } : {}),
    };
    const status = verificationStatusFromFacts(facts, request.options?.invalid === true ? 'invalid' : request.options?.stale === true ? 'stale' : undefined);
    return { success: status !== 'discovered', items: [{ content: value, metadata: { score, status, checks, facts } }], costAmount: 0, durationMs: Date.now() - started };
  }
}
