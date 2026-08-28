import { evidenceCoverage } from '@imea/evidence';

export interface EvidenceValidationInput {
  requiredConclusions: Array<{ key: string; evidenceRefs: string[] }>;
  allowedEvidenceIds: ReadonlySet<string>;
  evidenceGroupsById?: ReadonlyMap<string, string>;
  requireIndependentRouteSources?: boolean;
}

export interface EvidenceValidationResult {
  valid: boolean;
  coverage: number;
  errors: string[];
}

export class EvidenceValidator {
  validate(input: EvidenceValidationInput): EvidenceValidationResult {
    const errors: string[] = [];
    for (const conclusion of input.requiredConclusions) {
      for (const reference of conclusion.evidenceRefs) {
        if (!input.allowedEvidenceIds.has(reference)) errors.push(`unknown_evidence:${conclusion.key}:${reference}`);
      }
      if (conclusion.evidenceRefs.length === 0) errors.push(`missing_evidence:${conclusion.key}`);
      if (input.requireIndependentRouteSources) {
        const groups = new Set(conclusion.evidenceRefs.map((reference) => input.evidenceGroupsById?.get(reference) ?? reference));
        if (groups.size < 2) errors.push(`insufficient_independent_sources:${conclusion.key}`);
      }
    }
    const coverage = evidenceCoverage(input.requiredConclusions.map((item) => ({ ...item, required: true })));
    return { valid: errors.length === 0, coverage, errors };
  }
}
