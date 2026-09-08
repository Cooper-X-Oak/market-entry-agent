import { z } from 'zod';

const partySchema = z.object({ name: z.string().trim().min(1), website: z.url().optional() });
export const researchDefinitionSchema = z.object({
  version: z.literal(1),
  commissioningParty: partySchema.nullable(),
  supplier: partySchema.nullable(),
  supplierAssessment: z.literal('not_evaluated'),
  products: z.array(z.string().min(1)).min(1),
  regions: z.array(z.discriminatedUnion('level', [
    z.object({ level: z.literal('country'), countryCode: z.string().length(2) }),
    z.object({ level: z.literal('city'), countryCode: z.string().length(2), city: z.string().trim().min(1) }),
  ])).min(1),
  customerRoles: z.array(z.string().min(1)).min(1),
  provenance: z.enum(['user_statement', 'legacy_ambiguous']),
});
export type ResearchDefinition = z.infer<typeof researchDefinitionSchema>;

function cityKey(value: string): string {
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  return ['kazan', 'казань', '喀山'].includes(normalized) ? 'kazan' : normalized;
}
export function withinResearchRegions(definition: ResearchDefinition, entity: { countryCode?: string | null; city?: string | null }): boolean {
  return definition.regions.some(region => region.countryCode.toUpperCase() === entity.countryCode?.toUpperCase()
    && (region.level === 'country' || (entity.city != null && cityKey(region.city) === cityKey(entity.city))));
}

// Legacy company fields have no reliable party role. Preserve that ambiguity.
export function normalizeResearchDefinition(input: {
  researchDefinition?: unknown; productScope: string; targetCountries: string[];
  targetProfiles: Array<{ type: string }>;
}): ResearchDefinition {
  if (input.researchDefinition != null) return researchDefinitionSchema.parse(input.researchDefinition);
  return researchDefinitionSchema.parse({ version: 1, commissioningParty: null, supplier: null,
    supplierAssessment: 'not_evaluated', products: [input.productScope],
    regions: input.targetCountries.map(countryCode => ({ level: 'country', countryCode })),
    customerRoles: input.targetProfiles.map(profile => profile.type), provenance: 'legacy_ambiguous' });
}
