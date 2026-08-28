import { titleCase } from '@/lib/format';

const tones: Record<string, string> = {
  observed: 'success', user_confirmed: 'primary', confirmed: 'success', approved: 'success', completed: 'success', succeeded: 'success', won: 'success', manually_confirmed: 'success',
  inferred: 'info', running: 'info', active: 'info', cross_confirmed: 'info', source_confirmed: 'info', contact_path_verified: 'info',
  unknown: 'warning', proposed: 'warning', pending: 'warning', review: 'warning', awaiting_route_review: 'warning', changes_requested: 'warning', stale: 'warning', paused: 'warning',
  contradicted: 'danger', failed: 'danger', invalid: 'danger', rejected: 'danger', lost: 'danger', cancelled: 'danger',
  superseded: 'neutral', draft: 'neutral', archived: 'neutral', discovered: 'neutral',
};

const labels: Record<string, string> = { observed: 'Fact', inferred: 'Inference', unknown: 'Unknown', user_confirmed: 'User Confirmed', contradicted: 'Contradiction', superseded: 'Superseded' };

export function StatusBadge({ value }: { value: string }) { const tone = tones[value] ?? 'neutral'; return <span className={`badge badge-${tone}`}>{labels[value] ?? titleCase(value)}</span>; }

export function Confidence({ value }: { value: number }) { const level = value >= 70 ? 'High' : value >= 40 ? 'Medium' : 'Low'; return <div className="confidence" aria-label={`置信度 ${level} ${value}`}><span className="confidence-value">{level} {value}</span><span className="confidence-track"><span className="confidence-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span></div>; }
