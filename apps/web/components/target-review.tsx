'use client';

import { useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { TargetRow } from '@/lib/types';
import { Confidence } from './status';

export function TargetReview({ missionId, targets, enabled }: { missionId: string; targets: TargetRow[]; enabled: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(targets.filter((target) => target.mission.targetStatus === 'high_priority').map((target) => target.entity.id).slice(0, 3));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const toggle = (entityId: string): void => setSelected((current) => current.includes(entityId) ? current.filter((id) => id !== entityId) : current.length < 3 ? [...current, entityId] : current);
  async function submit(): Promise<void> {
    setPending(true); setError('');
    try {
      await apiClient(`/api/v1/missions/${missionId}/targets/review-complete`, { method: 'POST', body: JSON.stringify({ selectedTargetIds: selected, comment: '选择优先目标进入机会研究' }) });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '目标选择提交未完成'); }
    finally { setPending(false); }
  }
  return <div className="decision-list">
    {targets.map((target) => <article className="decision-row target-decision" key={target.entity.id} data-selected={selected.includes(target.entity.id)}>
      <label className="decision-check"><input type="checkbox" checked={selected.includes(target.entity.id)} disabled={!enabled || pending || (!selected.includes(target.entity.id) && selected.length >= 3)} onChange={() => toggle(target.entity.id)} /><span><Check aria-hidden="true" /></span></label>
      <div className="target-rank">{target.assessment.rank}</div>
      <div className="decision-main"><div className="decision-title"><strong>{target.entity.canonicalName}</strong><span className="badge badge-neutral">{target.assessment.marketRole}</span></div><p>{target.assessment.rationale || target.mission.discoveryReason}</p><div className="decision-tags"><span>{target.route.title}</span>{target.entity.countryCode && <span>{target.entity.countryCode}</span>}</div><details><summary>查看公开证据（{target.evidence.length}）</summary><div className="evidence-stack">{target.evidence.map((evidence) => <div key={evidence.evidenceId}><p>{evidence.excerpt}</p>{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceTitle ?? evidence.sourceUrl}</a>}</div>)}</div></details></div>
      <div className="target-score"><strong>{target.assessment.finalScore}</strong><span>综合分</span><Confidence value={target.assessment.evidenceQuality} /></div>
    </article>)}
    <div className="decision-submit"><div><strong>已选择 {selected.length}/3 个目标</strong><span>系统只为所选目标创建 Opportunity，并继续研究利益角色、公开联系路径和行动卡。</span></div><button className="button button-primary" disabled={!enabled || selected.length < 1 || selected.length > 3 || pending} onClick={submit}>{pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}{pending ? '提交中…' : '确认目标并继续'}</button></div>
    {!enabled && <p className="decision-note">当前 Mission 尚未进入目标选择工位。</p>}{error && <p className="command-error" role="alert">{error}</p>}
  </div>;
}
