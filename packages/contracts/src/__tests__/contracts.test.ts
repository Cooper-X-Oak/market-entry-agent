import { describe, expect, it } from 'vitest';
import { actionCardDecisionCommandSchema, agentExecutionContextSchema, createMissionRequestSchema, domainEventSchema, interactionInterpretationSchema } from '../index.js';

const id = (value: number) => `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const now = '2026-08-28T00:00:00.000Z';

describe('mission request contract', () => {
  it('parses a complete mission and applies budget defaults', () => {
    const mission = createMissionRequestSchema.parse({ name: 'Germany entry', companyName: 'Demo Flow', companyWebsite: 'https://demo.example', productScope: 'Industrial valves', targetCountries: ['DE'], targetIndustries: ['Chemical'], targetProfiles: [{ type: 'distributor', description: 'Technical distributor' }], objective: 'Find executable entry paths', successDefinition: 'One approved action', outputLanguages: ['en'], budgetConfig: {} });
    expect(mission.budgetConfig.maxTargets).toBe(20);
    expect(mission.targetCountries).toEqual(['DE']);
  });

  it('rejects invalid countries, URLs and undersized budgets', () => {
    expect(() => createMissionRequestSchema.parse({ name: 'x', companyName: 'x', companyWebsite: 'not-a-url', productScope: 'x', targetCountries: ['Germany'], targetIndustries: ['x'], targetProfiles: [{ type: 'x', description: 'x' }], objective: 'x', successDefinition: 'x', outputLanguages: ['en'], budgetConfig: { maxTargets: 1 } })).toThrow();
  });
});

describe('versioned execution contracts', () => {
  it('accepts a versioned domain event with actor, correlation and evidence-bearing payload', () => {
    const event = domainEventSchema.parse({
      id: id(1), tenantId: id(2), aggregateType: 'opportunity', aggregateId: id(3), aggregateVersion: 4,
      eventType: 'opportunity.state_transitioned.v1', schemaVersion: 1,
      payload: { tenantId: id(2), missionId: id(4), opportunityId: id(3), aggregateId: id(3), actor: { type: 'agent', id: 'opportunity-researcher' }, before: { status: 'contact_path_found' }, after: { status: 'contact_path_verified' }, evidenceRefs: [id(5)] },
      actor: { type: 'agent', id: 'opportunity-researcher' }, correlationId: id(6), occurredAt: now,
    });
    expect(event.eventType).toBe('opportunity.state_transitioned.v1');
    expect(event.payload.evidenceRefs).toEqual([id(5)]);
  });

  it('requires user feedback when action-card changes are requested', () => {
    expect(actionCardDecisionCommandSchema.safeParse({ decision: 'request_changes', expectedVersionNo: 1 }).success).toBe(false);
    expect(actionCardDecisionCommandSchema.parse({ decision: 'request_changes', expectedVersionNo: 1, comment: 'Use the procurement role mailbox.' }).comment).toBeTruthy();
  });

  it('requires interaction-derived facts and transitions to preserve their evidence chain', () => {
    const interpretation = interactionInterpretationSchema.parse({
      interactionId: id(10), interactionEvidenceRef: id(11),
      extractedFacts: [{ claimType: 'buyer_interest', statement: 'Buyer requested a technical meeting.', valueJson: true, status: 'observed', confidence: 94, evidenceRefs: [id(11)] }],
      contactUpdates: [], routeUpdates: [],
      opportunityTransition: { expectedFrom: 'contacted', to: 'responded', trigger: 'response_recorded', evidenceRefs: [id(11)], reason: 'Recorded reply' },
      nextAction: { regenerateActionCard: true, objective: 'Prepare the technical meeting.' }, unresolvedQuestions: [],
    });
    expect(interpretation.extractedFacts[0]?.evidenceRefs).toContain(id(11));
    expect(interpretation.opportunityTransition?.trigger).toBe('response_recorded');
  });

  it('parses a complete AgentExecutionContext with stable scope and explicit trust-chain records', () => {
    const context = agentExecutionContextSchema.parse({
      contextVersion: 1,
      scope: { tenantId: id(20), missionId: id(21), routeId: id(22), organizationId: id(23), opportunityId: id(24) },
      mission: { id: id(21), companyName: 'NovaFlow', companyWebsite: 'https://novaflow.example', productScope: 'Industrial valves', targetCountries: ['DE'], targetIndustries: ['Chemical'], targetProfiles: [{ type: 'distributor', description: 'Technical distributor' }], objective: 'Enter Germany', successDefinition: 'Approved outreach', outputLanguages: ['de', 'en'], budget: {}, stage: 'researching_contacts' },
      routes: [{ id: id(22), routeType: 'channel', title: 'Distributor route', hypothesis: 'Qualified distributors can open the market.', status: 'approved', confidence: 82, evidenceRefs: [id(30)], acceptedArtifactVersionId: id(31) }],
      organization: { id: id(23), canonicalName: 'RheinWerk GmbH', website: 'https://rheinwerk.example', countryCode: 'DE', marketRoles: ['distributor'], primaryRouteId: id(22), relevanceScore: 88, discoveryReason: 'Official portfolio match', relationships: [] },
      opportunity: { id: id(24), organizationId: id(23), routeId: id(22), title: 'Distributor partnership', hypothesis: 'Portfolio fit', status: 'contact_path_verified', priority: 'high', score: 82, scoreDimensions: { routeFit: 84 }, evidenceConfidence: 'high', commercialValueBand: 'high', resourceEfficiency: '4.2', nextAction: 'Review action card', unknowns: [] },
      stakeholders: [{ id: id(25), organizationId: id(23), roleType: 'procurement', title: 'Procurement', decisionInfluence: 80, contactPriority: 1, evidenceRefs: [id(30)] }],
      contacts: [{ id: id(26), organizationId: id(23), stakeholderRoleId: id(25), contactType: 'role_email', value: 'procurement@rheinwerk.example', normalizedValue: 'procurement@rheinwerk.example', verificationStatus: 'source_confirmed', confidence: 90, contactEvidenceRefs: [id(30)], employmentEvidenceRefs: [], verificationFacts: { exactValueListedByOfficialOrganization: true } }],
      interactions: [], claims: [],
      evidence: [{ evidenceId: id(30), sourceId: id(32), sourceSnapshotId: id(33), sourceType: 'official_website', url: 'https://rheinwerk.example/contact', normalizedUrl: 'https://rheinwerk.example/contact', fetchedAt: now, contentHash: 'sha256-fixture', excerpt: 'procurement@rheinwerk.example', locator: { selector: '#procurement' }, stance: 'support', authority: 'official_organization', independentGroupKey: 'rheinwerk.example', freshness: 100, relevance: 100 }],
      artifacts: [{ artifactId: id(34), artifactType: 'route_analysis', versionId: id(31), versionNo: 1, status: 'accepted', payload: {}, evidenceRefs: [id(30)] }],
      feedback: [], openQuestions: [{ question: 'Who owns the budget?', impact: 'Action-card personalization', aggregateId: id(24) }],
      execution: { skillKey: 'opportunity-researcher', objective: 'Build an executable contact path', outputLanguage: 'en', toolPermissions: ['web_search'], budgetRemaining: { maxSearchCalls: 60 }, correlationId: id(35) },
    });
    expect(context.evidence[0]?.locator.selector).toBe('#procurement');
    expect(context.routes[0]?.acceptedArtifactVersionId).toBe(id(31));
  });
});
