import type {
  ActionCardGateInput,
  ContactGateInput,
  ContactVerifiedGateInput,
  GateResult,
  LegacyActionCardGateInput,
  OpportunityCreationGateInput,
  RouteGateInput,
  RouteReviewGateInput,
  TargetGateInput,
} from './types.js';

function gate(checks: ReadonlyArray<readonly [boolean, string]>, details?: Record<string, unknown>): GateResult {
  const reasonCodes = checks.filter(([passed]) => !passed).map(([, reason]) => reason);
  return { passed: reasonCodes.length === 0, reasonCodes, failures: reasonCodes, ...(details ? { details } : {}) };
}

export function routeReviewGate(input: RouteReviewGateInput): GateResult {
  return gate([
    [input.approvedRouteIds.length > 0, 'ROUTE_APPROVAL_REQUIRED'],
    [input.acceptedArtifactVersionIds.length > 0, 'ACCEPTED_ROUTE_ARTIFACT_REQUIRED'],
  ], { approvedRouteCount: input.approvedRouteIds.length, acceptedArtifactVersionCount: input.acceptedArtifactVersionIds.length });
}

export function opportunityCreationGate(input: OpportunityCreationGateInput): GateResult {
  return gate([
    [input.entityResolved, 'ENTITY_NOT_RESOLVED'],
    [input.approvedRouteId.length > 0, 'APPROVED_ROUTE_REQUIRED'],
    [input.stakeholderRoleCount > 0, 'STAKEHOLDER_ROLE_REQUIRED'],
    [input.contactPointCount > 0, 'CONTACT_POINT_REQUIRED'],
    [input.evidenceRefs.length > 0, 'EVIDENCE_REQUIRED'],
    [input.score >= input.threshold, 'SCORE_BELOW_THRESHOLD'],
  ], { score: input.score, threshold: input.threshold });
}

export function contactVerifiedGate(input: ContactVerifiedGateInput): GateResult {
  const verified = ['source_confirmed', 'cross_confirmed', 'manually_confirmed'].includes(input.primaryContactStatus);
  return gate([
    [verified, 'PRIMARY_CONTACT_NOT_VERIFIED'],
    [input.primaryContactEvidenceRefs.length > 0, 'PRIMARY_CONTACT_EVIDENCE_REQUIRED'],
  ], { primaryContactStatus: input.primaryContactStatus });
}

function isLegacyActionCardGateInput(input: ActionCardGateInput | LegacyActionCardGateInput): input is LegacyActionCardGateInput {
  return 'hasScore' in input;
}

export function actionCardGate(input: ActionCardGateInput | LegacyActionCardGateInput): GateResult {
  if (isLegacyActionCardGateInput(input)) {
    return gate([
      [input.hasScore, 'OPPORTUNITY_SCORE_REQUIRED'],
      [input.hasPrimaryStakeholder, 'PRIMARY_STAKEHOLDER_REQUIRED'],
      [input.hasPrimaryContact, 'PRIMARY_CONTACT_REQUIRED'],
      [input.hasBackupContact, 'BACKUP_CONTACT_REQUIRED'],
      [input.hasContactReason, 'CONTACT_REASON_REQUIRED'],
      [input.hasStakeholderInterest, 'STAKEHOLDER_INTEREST_REQUIRED'],
      [input.hasObjective, 'FIRST_CONTACT_OBJECTIVE_REQUIRED'],
      [input.generatedContentCount > 0, 'MESSAGE_CONTENT_REQUIRED'],
      [input.evidenceCoverage >= 80, 'EVIDENCE_COVERAGE_BELOW_80'],
    ]);
  }
  const allowedStatus = ['contact_path_verified', 'action_ready', 'approved'].includes(input.opportunityStatus);
  const verifiedContact = ['source_confirmed', 'cross_confirmed', 'manually_confirmed'].includes(input.primaryContactStatus);
  return gate([
    [allowedStatus, 'OPPORTUNITY_NOT_ACTIONABLE'],
    [input.targetStakeholderRoleId.length > 0, 'TARGET_STAKEHOLDER_REQUIRED'],
    [input.primaryContactPointId.length > 0, 'PRIMARY_CONTACT_REQUIRED'],
    [verifiedContact, 'PRIMARY_CONTACT_NOT_VERIFIED'],
    [input.routeId.length > 0, 'APPROVED_ROUTE_REQUIRED'],
    [input.evidenceRefs.length > 0, 'EVIDENCE_REQUIRED'],
    [input.unresolvedCriticalUnknowns.length === 0, 'CRITICAL_UNKNOWNS_UNRESOLVED'],
  ], { opportunityStatus: input.opportunityStatus, primaryContactStatus: input.primaryContactStatus });
}

export function routeApprovalGate(input: RouteGateInput): GateResult {
  return gate([
    [input.approved, 'ROUTE_NOT_APPROVED'],
    [input.evidenceCount >= 2, 'INSUFFICIENT_ROUTE_EVIDENCE'],
    [input.keyEntityTypeCount > 0, 'KEY_ENTITY_TYPE_REQUIRED'],
    [input.keyStakeholderCount > 0, 'KEY_STAKEHOLDER_REQUIRED'],
    [input.primaryChannelCount > 0, 'PRIMARY_CHANNEL_REQUIRED'],
    [input.reviewCompleted, 'ROUTE_REVIEW_INCOMPLETE'],
  ]);
}

export function targetGate(input: TargetGateInput): GateResult {
  return gate([
    [input.entityResolved, 'ENTITY_NOT_RESOLVED'],
    [input.hasOfficialIdentity, 'OFFICIAL_IDENTITY_REQUIRED'],
    [input.marketRoleKnown, 'MARKET_ROLE_REQUIRED'],
    [input.linkedToApprovedRoute, 'APPROVED_ROUTE_REQUIRED'],
    [input.productFit >= 50, 'PRODUCT_FIT_BELOW_50'],
    [input.evidenceQuality >= 40, 'EVIDENCE_QUALITY_BELOW_40'],
  ]);
}

export function contactGate(input: ContactGateInput): GateResult {
  const now = input.now ?? new Date();
  const fresh = input.primaryVerifiedAt ? now.getTime() - input.primaryVerifiedAt.getTime() <= 90 * 24 * 60 * 60 * 1_000 : false;
  return gate([
    [input.stakeholderCount > 0, 'STAKEHOLDER_REQUIRED'],
    [input.contactCount > 0, 'CONTACT_REQUIRED'],
    [input.primaryHasSource, 'PRIMARY_SOURCE_REQUIRED'],
    [input.primaryVerificationScore >= 50, 'VERIFICATION_SCORE_BELOW_50'],
    [fresh, 'PRIMARY_CONTACT_STALE'],
    [input.backupCount > 0, 'BACKUP_CONTACT_REQUIRED'],
  ]);
}
