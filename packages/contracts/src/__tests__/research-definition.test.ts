import { describe, expect, it } from 'vitest';
import { createMissionRequestSchema, normalizeResearchDefinition, withinResearchRegions } from '../index.js';

const input = { name: '喀山客户研究', productScope: '阀门、管件', targetCountries: ['RU'], targetIndustries: ['流体设备'],
  targetProfiles: [{ type: 'integrator', description: '设备集成商' }], objective: '潜在客户研究', successDefinition: '一个可核验客户', outputLanguages: ['zh-CN'], budgetConfig: {} };
describe('research subjects and geographical authority', () => {
  it('supports a commissioning agency without a supplier or old company fields', () => {
    const mission = createMissionRequestSchema.parse({ ...input, researchDefinition: { version: 1,
      commissioningParty: { name: '温州和平广告', website: 'https://51heping.com' }, supplier: null, supplierAssessment: 'not_evaluated',
      products: ['阀门', '管件'], regions: [{ level: 'city', countryCode: 'RU', city: '喀山' }], customerRoles: ['integrator'], provenance: 'user_statement' } });
    const definition = normalizeResearchDefinition(mission);
    expect(definition.supplier).toBeNull();
    expect(withinResearchRegions(definition, { countryCode: 'RU', city: 'Казань' })).toBe(true);
    expect(withinResearchRegions(definition, { countryCode: 'RU', city: 'Moscow' })).toBe(false);
    expect(withinResearchRegions(definition, { countryCode: 'RU' })).toBe(false);
  });
  it('retains legacy company ambiguity instead of declaring a manufacturer', () => {
    const mission = createMissionRequestSchema.parse({ ...input, companyName: 'Historical Company', companyWebsite: 'https://legacy.invalid' });
    expect(normalizeResearchDefinition(mission)).toMatchObject({ commissioningParty: null, supplier: null, provenance: 'legacy_ambiguous', supplierAssessment: 'not_evaluated' });
  });
});
