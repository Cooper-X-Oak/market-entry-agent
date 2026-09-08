import { evidenceCoverage } from '@imea/evidence';
import { contactContentSupports } from './contact-content.js';
import type { ContentReview } from './content-review.js';

export interface EvidenceValidationInput {
  requiredConclusions: Array<{ key: string; evidenceRefs: string[]; statement?: string; mode?: 'observed' | 'inferred' | 'counter' }>;
  contentReviews?: ReadonlyMap<string, ContentReview>;
  allowedEvidenceIds: ReadonlySet<string>;
  evidenceContentById?: ReadonlyMap<string, { excerpt: string; stance: string; url?: string }>;
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
      if (conclusion.statement && input.evidenceContentById) {
        // Conservative extraction gate: paraphrases/inferences need separate review,
        // never upgrade them to observed facts based on a merely well-formed ID.
        const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
        const supported = conclusion.evidenceRefs.some(reference => {
          const evidence = input.evidenceContentById?.get(reference);
          return conclusion.mode !== 'counter' && evidence && evidence.stance !== 'oppose' && (conclusion.key.endsWith('.contactEvidenceRefs') ? contactContentSupports(conclusion.statement!, evidence.excerpt, evidence.url) : normalize(evidence.excerpt) === normalize(conclusion.statement!));
        });
        const review = input.contentReviews?.get(conclusion.key);
        const relationAllowed = conclusion.mode === 'counter' ? review?.relation === 'contradiction' : review?.relation === 'paraphrase' || conclusion.mode === 'inferred' && review?.relation === 'inference';
        const reviewed = !conclusion.key.endsWith('.contactEvidenceRefs') && relationAllowed && review && review.quotes.length > 0 && review.quotes.every(quote => {
          const evidence = input.evidenceContentById?.get(quote.evidenceId);
          return conclusion.evidenceRefs.includes(quote.evidenceId) && evidence && (conclusion.mode === 'counter' ? evidence.stance === 'oppose' : evidence.stance !== 'oppose') && evidence.excerpt.includes(quote.quote);
        });
        if (!supported && !reviewed) errors.push(`content_support_unverified:${conclusion.key}`);
      }
      if (input.requireIndependentRouteSources && conclusion.key.endsWith('.supportingEvidenceRefs')) {
        const groups = new Set(conclusion.evidenceRefs.map((reference) => input.evidenceGroupsById?.get(reference) ?? reference));
        if (groups.size < 2) errors.push(`insufficient_independent_sources:${conclusion.key}`);
      }
    }
    const coverage = evidenceCoverage(input.requiredConclusions.map((item) => ({ ...item, required: true })));
    return { valid: errors.length === 0, coverage, errors };
  }
}
