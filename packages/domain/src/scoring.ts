import type { CommercialValueBand } from './types.js';

export interface OpportunityScoreDimensions {
  productFit: number;
  routeFit: number;
  demandSignal: number;
  timingSignal: number;
  stakeholderRelevance: number;
  contactability: number;
  evidenceQuality: number;
  strategicValue: number;
}

export type EvidenceConfidence = 'low' | 'medium' | 'high';
export type ExecutionState = 'target_only' | 'stakeholder_mapped' | 'contact_found' | 'contact_verified';

const weights: Record<keyof OpportunityScoreDimensions, number> = {
  productFit: 0.15,
  routeFit: 0.15,
  demandSignal: 0.15,
  timingSignal: 0.1,
  stakeholderRelevance: 0.1,
  contactability: 0.15,
  evidenceQuality: 0.1,
  strategicValue: 0.1,
};

const evidenceMultipliers: Record<EvidenceConfidence, number> = { low: 0.7, medium: 0.85, high: 1 };
const executionMultipliers: Record<ExecutionState, number> = { target_only: 0.6, stakeholder_mapped: 0.75, contact_found: 0.85, contact_verified: 1 };
const commercialValuePoints: Record<CommercialValueBand, number> = { very_low: 10, low: 25, medium: 50, high: 75, strategic: 100 };

export interface OpportunityScoreResult {
  baseScore: number;
  finalScore: number;
  commercialValuePoints: number;
  verifiedOpportunityValue: number;
  resourceCost: number;
  resourceEfficiency: number;
}

export interface ResourceInput {
  salesHours: number;
  technicalHours: number;
  marketCostPoints: number;
  sampleCostPoints: number;
  travelCostPoints: number;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function scoreOpportunity(dimensions: OpportunityScoreDimensions, evidence: EvidenceConfidence, execution: ExecutionState, band: CommercialValueBand, resources: ResourceInput): OpportunityScoreResult {
  const baseScore = (Object.keys(dimensions) as Array<keyof OpportunityScoreDimensions>).reduce((total, key) => total + bounded(dimensions[key]) * weights[key], 0);
  const finalScore = Math.round(baseScore * evidenceMultipliers[evidence] * executionMultipliers[execution]);
  const valuePoints = commercialValuePoints[band];
  const verifiedOpportunityValue = valuePoints * finalScore / 100;
  const resourceCost = resources.salesHours + resources.technicalHours * 1.5 + resources.marketCostPoints + resources.sampleCostPoints + resources.travelCostPoints;
  return {
    baseScore: Number(baseScore.toFixed(2)),
    finalScore,
    commercialValuePoints: valuePoints,
    verifiedOpportunityValue: Number(verifiedOpportunityValue.toFixed(2)),
    resourceCost: Number(resourceCost.toFixed(2)),
    resourceEfficiency: Number((verifiedOpportunityValue / Math.max(resourceCost, 1)).toFixed(4)),
  };
}
