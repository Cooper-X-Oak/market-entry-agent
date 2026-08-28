import { z } from 'zod';
import { confidenceSchema, entityCandidateSchema, interactionInterpretationSchema, uuidSchema } from '@imea/contracts';

export const competitorResearchResultSchema = z.object({
  competitors: z.array(z.object({
    entityCandidate: entityCandidateSchema,
    marketPresenceSummary: z.string(),
    routePatterns: z.array(z.string()),
    localChannels: z.array(entityCandidateSchema),
    exhibitions: z.array(entityCandidateSchema),
    publicCustomers: z.array(entityCandidateSchema),
    certifications: z.array(z.string()),
    serviceNetwork: z.array(z.string()),
    marketMinimums: z.array(z.string()),
    opportunityGaps: z.array(z.string()),
    evidenceRefs: z.array(uuidSchema),
    confidence: confidenceSchema,
  })),
});

export const expertSignalResearchResultSchema = z.object({
  opinions: z.array(z.object({
    person: entityCandidateSchema.optional(),
    organization: entityCandidateSchema.optional(),
    topic: z.string(),
    positionSummary: z.string(),
    marketImplication: z.string(),
    credibilityScore: confidenceSchema,
    commercialInterest: z.string().optional(),
    contactable: z.boolean(),
    evidenceRefs: z.array(uuidSchema),
  })),
});

export const entityResolutionResultSchema = z.object({
  decision: z.enum(['create', 'merge', 'link']),
  matchedEntityId: uuidSchema.optional(),
  canonicalName: z.string(),
  confidence: confidenceSchema,
  reasons: z.array(z.string()),
  evidenceRefs: z.array(uuidSchema),
});

export const interactionInterpretationResultSchema = interactionInterpretationSchema;
