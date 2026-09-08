'use client';

import { useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { MarketRoute } from '@/lib/types';
import { Confidence, StatusBadge } from './status';

export function RouteReview({ missionId, routes, enabled }: { missionId: string; routes: MarketRoute[]; enabled: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(routes.filter((route) => route.status === 'approved').map((route) => route.id));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const toggle = (routeId: string): void => setSelected((current) => current.includes(routeId) ? current.filter((id) => id !== routeId) : current.length < 3 ? [...current, routeId] : current);
  async function submit(): Promise<void> {
    setPending(true); setError('');
    try {
      const acceptedArtifactVersionIds = [...new Set(routes.filter((route) => selected.includes(route.id)).map((route) => route.artifactVersionId))];
      await apiClient(`/api/v1/missions/${missionId}/routes/review-complete`, { method: 'POST', body: JSON.stringify({ approvedRouteIds: selected, acceptedArtifactVersionIds, comment: '批准所选路线进入目标研究' }) });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '路线评审提交未完成'); }
    finally { setPending(false); }
  }
  return <div className="decision-list">
    {routes.map((route) => <article className="decision-row" key={route.id} data-selected={selected.includes(route.id)}>
      <label className="decision-check"><input type="checkbox" checked={selected.includes(route.id)} disabled={!enabled || pending || (!selected.includes(route.id) && selected.length >= 3)} onChange={() => toggle(route.id)} /><span><Check aria-hidden="true" /></span></label>
      <div className="decision-main"><div className="decision-title"><strong>{route.rank}. {route.title}</strong><StatusBadge value={route.status} /><span className="badge badge-neutral">{route.routeType}</span></div><p>{route.hypothesis}</p><div className="decision-tags">{route.keyEntityTypes.map((type) => <span key={type}>{type}</span>)}</div>
        <details><summary>查看支撑证据（{route.supportingEvidence.length}）与反向证据（{route.counterEvidence.length}）</summary><div className="evidence-stack">{[...route.supportingEvidence, ...route.counterEvidence].map((evidence) => <div key={evidence.evidenceId}><p>{evidence.excerpt}</p>{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceTitle ?? evidence.sourceUrl}</a>}</div>)}</div></details>
      </div>
      <div className="decision-score"><span>置信度</span><Confidence value={route.confidence} /><span>进入难度 <strong>{route.entryDifficulty}</strong></span><span>资源投入 <strong>{route.resourceIntensity}</strong></span></div>
    </article>)}
    <div className="decision-submit"><div><strong>已选择 {selected.length}/3 条路线</strong><span>批准后将以这些路线为边界研究真实目标组织。</span></div><button className="button button-primary" disabled={!enabled || selected.length === 0 || selected.length > 3 || pending} onClick={submit}>{pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}{pending ? '提交中…' : '批准路线并继续'}</button></div>
    {!enabled && <p className="decision-note">当前 Mission 尚未进入路线评审工位。</p>}{error && <p className="command-error" role="alert">{error}</p>}
  </div>;
}
