import { describe, expect, it } from 'vitest';
import { actionCardGate, actionCardTransitions, assertTransition, contactGate, contactTransitions, contactVerifiedGate, deriveContactVerificationStatus, missionStageTransitions, nextActionCardVersion, opportunityCreationGate, opportunityTransitions, routeApprovalGate, routeReviewGate, scoreOpportunity, targetGate, transitionOpportunity } from '../index.js';

const id = (value: number) => `41000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('domain state machines', () => {
  it('accepts declared forward transitions', () => {
    expect(() => assertTransition('mission', missionStageTransitions, 'draft', 'compiling')).not.toThrow();
    expect(() => assertTransition('contact', contactTransitions, 'source_confirmed', 'cross_confirmed')).not.toThrow();
    expect(() => assertTransition('opportunity', opportunityTransitions, 'approved', 'contacted')).not.toThrow();
    expect(() => assertTransition('action_card', actionCardTransitions, 'review', 'approved')).not.toThrow();
  });

  it('rejects skipped or reversed transitions', () => {
    expect(() => assertTransition('mission', missionStageTransitions, 'draft', 'active')).toThrow(/Cannot transition/);
    expect(() => assertTransition('action_card', actionCardTransitions, 'executed', 'draft')).toThrow(/Cannot transition/);
  });
});

describe('structured business gates and command transitions', () => {
  it('returns stable reason codes for incomplete route, opportunity and action-card gates', () => {
    expect(routeReviewGate({ approvedRouteIds: [], acceptedArtifactVersionIds: [] }).reasonCodes).toEqual(['ROUTE_APPROVAL_REQUIRED', 'ACCEPTED_ROUTE_ARTIFACT_REQUIRED']);
    expect(opportunityCreationGate({ entityResolved: true, approvedRouteId: id(1), stakeholderRoleCount: 0, contactPointCount: 0, evidenceRefs: [], score: 40, threshold: 60 }).reasonCodes).toEqual(['STAKEHOLDER_ROLE_REQUIRED', 'CONTACT_POINT_REQUIRED', 'EVIDENCE_REQUIRED', 'SCORE_BELOW_THRESHOLD']);
    expect(actionCardGate({ opportunityStatus: 'contact_path_verified', targetStakeholderRoleId: id(2), primaryContactPointId: id(3), primaryContactStatus: 'source_confirmed', routeId: id(4), evidenceRefs: [id(5)], unresolvedCriticalUnknowns: [], generatedContentCount: 1 }).passed).toBe(true);
  });

  it('derives contact trust status only from the declared verification facts', () => {
    const base = { formatCheckPassed: true, exactValueListedByOfficialOrganization: false, independentConfirmationGroups: [], employmentConfirmationEvidenceIds: [] };
    expect(deriveContactVerificationStatus(base)).toBe('format_valid');
    expect(deriveContactVerificationStatus({ ...base, exactValueListedByOfficialOrganization: true, exactValueLocatorEvidenceId: id(10) })).toBe('source_confirmed');
    expect(deriveContactVerificationStatus({ ...base, independentConfirmationGroups: ['official', 'registry'] })).toBe('cross_confirmed');
    expect(deriveContactVerificationStatus(base, 'stale')).toBe('stale');
  });

  it('binds opportunity transitions to legal triggers and evidence', () => {
    const command = { tenantId: id(20), missionId: id(21), opportunityId: id(22), expectedFrom: 'contacted' as const, to: 'responded' as const, trigger: 'response_recorded' as const, evidenceRefs: [id(23)], interactionId: id(24), actor: { type: 'user' as const, id: id(25) }, correlationId: id(26) };
    expect(transitionOpportunity(command)).toMatchObject({ from: 'contacted', to: 'responded', trigger: 'response_recorded' });
    expect(() => transitionOpportunity({ ...command, trigger: 'quotation_recorded' })).toThrow(/Cannot transition/);
    expect(() => transitionOpportunity({ ...command, evidenceRefs: [] })).toThrow(/Cannot transition/);
  });

  it('creates immutable action-card revisions linked to feedback', () => {
    expect(nextActionCardVersion({ currentVersionNo: 2, currentStatus: 'changes_requested', feedbackRefs: [id(30)] })).toEqual({ versionNo: 3, basedOnVersionNo: 2, status: 'draft', feedbackRefs: [id(30)] });
    expect(() => nextActionCardVersion({ currentVersionNo: 2, currentStatus: 'draft', feedbackRefs: [] })).toThrow(/Cannot transition/);
  });

  it('enforces route, target and contact promotion gates', () => {
    expect(routeApprovalGate({ approved: true, evidenceCount: 2, keyEntityTypeCount: 1, keyStakeholderCount: 1, primaryChannelCount: 1, reviewCompleted: true }).passed).toBe(true);
    expect(routeApprovalGate({ approved: false, evidenceCount: 1, keyEntityTypeCount: 0, keyStakeholderCount: 0, primaryChannelCount: 0, reviewCompleted: false }).reasonCodes).toHaveLength(6);
    expect(targetGate({ entityResolved: true, hasOfficialIdentity: true, marketRoleKnown: true, linkedToApprovedRoute: true, productFit: 50, evidenceQuality: 40 }).passed).toBe(true);
    expect(targetGate({ entityResolved: false, hasOfficialIdentity: false, marketRoleKnown: false, linkedToApprovedRoute: false, productFit: 49, evidenceQuality: 39 }).reasonCodes).toHaveLength(6);
    const now = new Date('2026-08-28T00:00:00.000Z');
    expect(contactGate({ stakeholderCount: 1, contactCount: 2, primaryHasSource: true, primaryVerificationScore: 80, primaryVerifiedAt: new Date('2026-08-27T00:00:00.000Z'), backupCount: 1, now }).passed).toBe(true);
    expect(contactGate({ stakeholderCount: 0, contactCount: 0, primaryHasSource: false, primaryVerificationScore: 10, primaryVerifiedAt: new Date('2025-01-01T00:00:00.000Z'), backupCount: 0, now }).reasonCodes).toHaveLength(6);
  });

  it('enforces verified-contact and both action-card gate contracts', () => {
    expect(contactVerifiedGate({ primaryContactStatus: 'cross_confirmed', primaryContactEvidenceRefs: [id(40)] }).passed).toBe(true);
    expect(contactVerifiedGate({ primaryContactStatus: 'format_valid', primaryContactEvidenceRefs: [] }).reasonCodes).toEqual(['PRIMARY_CONTACT_NOT_VERIFIED', 'PRIMARY_CONTACT_EVIDENCE_REQUIRED']);
    expect(actionCardGate({ hasScore: true, hasPrimaryStakeholder: true, hasPrimaryContact: true, hasBackupContact: true, hasContactReason: true, hasStakeholderInterest: true, hasObjective: true, generatedContentCount: 1, evidenceCoverage: 80 }).passed).toBe(true);
    expect(actionCardGate({ hasScore: false, hasPrimaryStakeholder: false, hasPrimaryContact: false, hasBackupContact: false, hasContactReason: false, hasStakeholderInterest: false, hasObjective: false, generatedContentCount: 0, evidenceCoverage: 79 }).reasonCodes).toHaveLength(9);
    expect(actionCardGate({ opportunityStatus: 'observed', targetStakeholderRoleId: '', primaryContactPointId: '', primaryContactStatus: 'format_valid', routeId: '', evidenceRefs: [], unresolvedCriticalUnknowns: ['budget'], generatedContentCount: 0 }).reasonCodes).toHaveLength(8);
  });
});

describe('opportunity scoring', () => {
  it('applies evidence and execution multipliers and computes resource efficiency', () => {
    const score = scoreOpportunity({ productFit: 90, routeFit: 80, demandSignal: 70, timingSignal: 60, stakeholderRelevance: 90, contactability: 100, evidenceQuality: 80, strategicValue: 70 }, 'high', 'contact_verified', 'high', { salesHours: 10, technicalHours: 5, marketCostPoints: 2, sampleCostPoints: 0, travelCostPoints: 0 });
    expect(score.baseScore).toBe(81);
    expect(score.finalScore).toBe(81);
    expect(score.resourceCost).toBe(19.5);
    expect(score.resourceEfficiency).toBeGreaterThan(3);
  });

  it('bounds invalid dimensions and never divides by zero', () => {
    const score = scoreOpportunity({ productFit: 120, routeFit: -20, demandSignal: 0, timingSignal: 0, stakeholderRelevance: 0, contactability: 0, evidenceQuality: 0, strategicValue: 0 }, 'low', 'target_only', 'very_low', { salesHours: 0, technicalHours: 0, marketCostPoints: 0, sampleCostPoints: 0, travelCostPoints: 0 });
    expect(score.baseScore).toBe(15);
    expect(score.resourceCost).toBe(0);
    expect(Number.isFinite(score.resourceEfficiency)).toBe(true);
  });
});
