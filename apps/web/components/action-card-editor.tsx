'use client';

import { useState } from 'react';
import { Copy, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { ActionCard } from '@/lib/types';
import { Panel } from './panel';

export function ActionCardEditor({ missionId, card }: { missionId: string; card: ActionCard }) {
  const router = useRouter();
  const [form, setForm] = useState({ objective: card.objective, contactReason: card.contactReason, timingReason: card.timingReason, stakeholderInterest: card.stakeholderInterest, valueHypothesis: card.valueHypothesis, emailSubject: card.emailSubject ?? '', emailBody: card.emailBody ?? '', socialMessage: card.socialMessage ?? '', callOpening: card.callOpening ?? '' });
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save() { setSaving(true); try { await apiClient(`/api/v1/missions/${missionId}/action-cards/${card.id}`, { method: 'PATCH', body: JSON.stringify({ ...form, expectedVersionNo: card.versionNo }) }); router.refresh(); } finally { setSaving(false); } }
  async function copy(value: string) { await navigator.clipboard.writeText(value); }
  return <Panel title="行动内容" description="编辑会保留当前版本的审计记录。"><div className="stack"><Field label="首次联系目标" value={form.objective} onChange={(value) => update('objective', value)} /><Field label="联系理由" value={form.contactReason} onChange={(value) => update('contactReason', value)} multiline /><Field label="为什么是现在" value={form.timingReason} onChange={(value) => update('timingReason', value)} multiline /><Field label="对方利益点" value={form.stakeholderInterest} onChange={(value) => update('stakeholderInterest', value)} multiline /><Field label="价值主张" value={form.valueHypothesis} onChange={(value) => update('valueHypothesis', value)} multiline /><Field label="邮件主题" value={form.emailSubject} onChange={(value) => update('emailSubject', value)} copy={() => copy(form.emailSubject)} /><Field label="邮件正文" value={form.emailBody} onChange={(value) => update('emailBody', value)} multiline copy={() => copy(form.emailBody)} /><Field label="短消息" value={form.socialMessage} onChange={(value) => update('socialMessage', value)} multiline copy={() => copy(form.socialMessage)} /><Field label="电话开场" value={form.callOpening} onChange={(value) => update('callOpening', value)} multiline copy={() => copy(form.callOpening)} /><div><button className="button button-primary" onClick={save} disabled={saving}><Save />{saving ? '保存中…' : '保存修改'}</button></div></div></Panel>;
}

function Field({ label, value, onChange, multiline, copy }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; copy?: () => void }) { return <label className="field"><span className="field-label">{label}</span><div style={{ position: 'relative' }}>{multiline ? <textarea className="textarea" value={value} rows={5} onChange={(event) => onChange(event.target.value)} /> : <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />}{copy && <button type="button" className="button button-ghost icon-button" aria-label={`复制${label}`} onClick={copy} style={{ position: 'absolute', right: 7, top: 7 }}><Copy /></button>}</div></label>; }
