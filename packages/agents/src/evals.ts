export interface AgentEvalCase {
  key: string;
  input: { company: string; product: string; targetCountry: string; targetIndustries: string[] };
  fixtures: { website: string; search: string };
  expected: { routeTypes: string[]; entityTypes: string[]; contactTypes: string[]; actionCardFields: string[] };
}

export interface AgentEvalCandidate {
  schemaValid: boolean;
  conclusions: Array<{ evidenceRefs: string[]; locator?: Record<string, unknown> }>;
  routeTypes: string[];
  entities: Array<{ canonicalName: string; entityType: string; sourceRef?: string }>;
  contacts: Array<{ contactType: string; sourceRef?: string }>;
  actionCard: Record<string, unknown>;
  transitions?: Array<{ legal: boolean; evidenceRefs: string[] }>;
  interactionFacts?: Array<{ evidenceRef?: string; feedbackRef?: string }>;
}

export interface AgentEvalMetrics {
  schemaPassRate: number;
  evidenceCoverage: number;
  routeTypeHitRate: number;
  entityDuplicateRate: number;
  contactSourceCompleteness: number;
  exactLocatorHitRate: number;
  actionCardCompleteness: number;
  legalTransitionRate: number;
  interactionFeedbackLinkRate: number;
}

function ratio(numerator: number, denominator: number): number { return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4)); }

export function evaluateAgentCase(testCase: AgentEvalCase, candidate: AgentEvalCandidate): AgentEvalMetrics {
  const normalizedEntities = candidate.entities.map((entity) => entity.canonicalName.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  const uniqueEntities = new Set(normalizedEntities);
  return {
    schemaPassRate: candidate.schemaValid ? 1 : 0,
    evidenceCoverage: ratio(candidate.conclusions.filter((item) => item.evidenceRefs.length > 0).length, candidate.conclusions.length),
    routeTypeHitRate: ratio(testCase.expected.routeTypes.filter((type) => candidate.routeTypes.includes(type)).length, testCase.expected.routeTypes.length),
    entityDuplicateRate: ratio(normalizedEntities.length - uniqueEntities.size, normalizedEntities.length),
    contactSourceCompleteness: ratio(candidate.contacts.filter((contact) => Boolean(contact.sourceRef)).length, candidate.contacts.length),
    exactLocatorHitRate: ratio(candidate.conclusions.filter((item) => item.locator && Object.keys(item.locator).length > 0).length, candidate.conclusions.length),
    actionCardCompleteness: ratio(testCase.expected.actionCardFields.filter((field) => candidate.actionCard[field] !== undefined && candidate.actionCard[field] !== '').length, testCase.expected.actionCardFields.length),
    legalTransitionRate: ratio((candidate.transitions ?? []).filter((transition) => transition.legal && transition.evidenceRefs.length > 0).length, (candidate.transitions ?? []).length),
    interactionFeedbackLinkRate: ratio((candidate.interactionFacts ?? []).filter((fact) => Boolean(fact.evidenceRef && fact.feedbackRef)).length, (candidate.interactionFacts ?? []).length),
  };
}
