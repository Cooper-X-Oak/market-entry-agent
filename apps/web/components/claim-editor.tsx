'use client';

import { Pencil, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Claim } from '@/lib/types';

export function ClaimEditor({ missionId, claim }: { missionId: string; claim: Claim }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [pending, setPending] = useState(false); const [statement, setStatement] = useState(claim.statement); const [confidence, setConfidence] = useState(claim.confidence);
  async function save(): Promise<void> { setPending(true); try { await apiClient(`/api/v1/missions/${missionId}/capabilities/${claim.id}`, { method: 'PATCH', body: JSON.stringify({ statement, confidence }) }); setOpen(false); router.refresh(); } finally { setPending(false); } }
  return <span style={{ position: 'relative' }}><button className="button button-ghost" type="button" onClick={() => setOpen((value) => !value)}><Pencil />编辑</button>{open && <span className="panel" style={{ position: 'absolute', zIndex: 20, right: 0, top: 38, width: 420, padding: 14, textAlign: 'left', boxShadow: 'var(--shadow-lg)' }}><label className="field"><span className="field-label">声明</span><textarea className="textarea" rows={4} value={statement} onChange={(event) => setStatement(event.target.value)} /></label><label className="field" style={{ marginTop: 10 }}><span className="field-label">置信度</span><input className="input" type="number" min={0} max={100} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label><button className="button button-primary" type="button" style={{ marginTop: 12 }} disabled={pending} onClick={save}><Save />{pending ? '保存中…' : '保存'}</button></span>}</span>;
}
