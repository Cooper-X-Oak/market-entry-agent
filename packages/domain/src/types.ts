import type { ContactVerificationStatus, OpportunityStatus } from '@imea/contracts';

export type CommercialValueBand = 'very_low' | 'low' | 'medium' | 'high' | 'strategic';

export interface GateResult {
  passed: boolean;
  reasonCodes: string[];
  failures: string[];
  details?: Record<string, unknown>;
}

export interface RouteReviewGateInput {
  approvedRouteIds: string[];
  acceptedArtifactVersionIds: string[];
}

export interface OpportunityCreationGateInput {
  entityResolved: boolean;
  approvedRouteId: string;
  stakeholderRoleCount: number;
  contactPointCount: number;
  evidenceRefs: string[];
  score: number;
  threshold: number;
}

export interface ContactVerifiedGateInput {
  primaryContactStatus: ContactVerificationStatus;
  primaryContactEvidenceRefs: string[];
}

export interface ActionCardGateInput {
  opportunityStatus: OpportunityStatus;
  targetStakeholderRoleId: string;
  primaryContactPointId: string;
  primaryContactStatus: ContactVerificationStatus;
  routeId: string;
  evidenceRefs: string[];
  unresolvedCriticalUnknowns: string[];
}

export interface RouteGateInput {
  approved: boolean;
  evidenceCount: number;
  keyEntityTypeCount: number;
  keyStakeholderCount: number;
  primaryChannelCount: number;
  reviewCompleted: boolean;
}

export interface TargetGateInput {
  entityResolved: boolean;
  hasOfficialIdentity: boolean;
  marketRoleKnown: boolean;
  linkedToApprovedRoute: boolean;
  productFit: number;
  evidenceQuality: number;
}

export interface ContactGateInput {
  stakeholderCount: number;
  contactCount: number;
  primaryHasSource: boolean;
  primaryVerificationScore: number;
  primaryVerifiedAt?: Date;
  backupCount: number;
  now?: Date;
}

export interface LegacyActionCardGateInput {
  hasScore: boolean;
  hasPrimaryStakeholder: boolean;
  hasPrimaryContact: boolean;
  hasBackupContact: boolean;
  hasContactReason: boolean;
  hasStakeholderInterest: boolean;
  hasObjective: boolean;
  generatedContentCount: number;
  evidenceCoverage: number;
}
