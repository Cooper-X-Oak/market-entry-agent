export interface EvidenceConclusion {
  key: string;
  required: boolean;
  evidenceRefs: string[];
}

export function evidenceCoverage(conclusions: readonly EvidenceConclusion[]): number {
  const required = conclusions.filter((item) => item.required);
  if (required.length === 0) return 100;
  const covered = required.filter((item) => item.evidenceRefs.length > 0).length;
  return Math.round(covered / required.length * 100);
}

export interface FreshnessPolicy {
  type: string;
  validDays: number | null;
}

export const freshnessPolicies: readonly FreshnessPolicy[] = [
  { type: 'person_employment', validDays: 90 },
  { type: 'direct_contact', validDays: 90 },
  { type: 'department_contact', validDays: 180 },
  { type: 'procurement_portal', validDays: 180 },
  { type: 'company_description', validDays: 180 },
  { type: 'competitor_channel', validDays: 180 },
  { type: 'market_route_evidence', validDays: 180 },
  { type: 'industry_opinion', validDays: 365 },
];

export function isFresh(observedAt: Date, policyType: string, now = new Date()): boolean {
  const policy = freshnessPolicies.find((candidate) => candidate.type === policyType);
  if (!policy || policy.validDays === null) return true;
  return now.getTime() - observedAt.getTime() <= policy.validDays * 24 * 60 * 60 * 1000;
}

export interface EntityIdentity {
  canonicalName: string;
  countryCode?: string;
  website?: string;
  registrationNumber?: string;
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase().replace(/\b(ltd|limited|inc|corp|corporation|gmbh|llc|co)\b\.?/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function domain(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return undefined; }
}

export type ResolutionDecision = 'create' | 'merge' | 'link';

export function resolveEntity(candidate: EntityIdentity, existing: EntityIdentity & { id: string }): { decision: ResolutionDecision; matchedEntityId?: string; reasons: string[] } {
  const reasons: string[] = [];
  if (candidate.registrationNumber && existing.registrationNumber === candidate.registrationNumber) reasons.push('registration_number_match');
  if (domain(candidate.website) && domain(candidate.website) === domain(existing.website)) reasons.push('official_domain_match');
  const sameName = normalizedName(candidate.canonicalName) === normalizedName(existing.canonicalName);
  if (sameName && candidate.countryCode === existing.countryCode) reasons.push('normalized_name_and_country_match');
  if (reasons.length > 0) return { decision: 'merge', matchedEntityId: existing.id, reasons };
  if (sameName) return { decision: 'link', matchedEntityId: existing.id, reasons: ['normalized_name_match_requires_review'] };
  return { decision: 'create', reasons: ['no_reliable_match'] };
}
