'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import type { CommandReceipt } from '@/lib/types';
import { Panel } from './panel';

const submittedFactsSchema = z.array(z.record(z.string(), z.unknown()));
function formText(data: FormData, name: string): string { const value = data.get(name); return typeof value === 'string' ? value : ''; }

export function InteractionForm({ missionId, opportunityId, actionCardId }: { missionId: string; opportunityId: string; actionCardId?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setPending(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const rawFacts = formText(data, 'submittedFacts').trim();
      const submittedFacts = rawFacts ? submittedFactsSchema.parse(JSON.parse(rawFacts) as unknown) : [];
      const followUpAt = formText(data, 'followUpAt');
      await apiClient<CommandReceipt>(`/api/v1/missions/${missionId}/opportunities/${opportunityId}/interactions`, { method: 'POST', body: JSON.stringify({ ...(actionCardId ? { actionCardId } : {}), interactionType: formText(data, 'interactionType'), occurredAt: new Date(formText(data, 'occurredAt')).toISOString(), channel: formText(data, 'channel'), summary: formText(data, 'summary'), rawContent: formText(data, 'rawContent'), outcome: formText(data, 'outcome'), submittedFacts, nextAction: formText(data, 'nextAction') || undefined, followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined }) });
      event.currentTarget.reset(); setProcessing(true); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '互动记录失败'); }
    finally { setPending(false); }
  }
  return <Panel title="新增互动结果" description="记录真实外联结果后，Workflow 会提取新事实并更新机会状态。"><form className="stack" onSubmit={submit}><div className="form-grid"><label className="field"><span className="field-label">互动类型</span><select className="select" name="interactionType" defaultValue="email_sent"><option value="email_sent">邮件已发送</option><option value="message_sent">消息已发送</option><option value="call">电话</option><option value="meeting">会议</option><option value="form_submitted">表单已提交</option><option value="supplier_registration">供应商注册</option><option value="response">收到回复</option><option value="qualification_update">资格更新</option><option value="sample_sent">样品已发送</option><option value="quotation_sent">报价已发送</option></select></label><label className="field"><span className="field-label">发生时间</span><input className="input" name="occurredAt" type="datetime-local" defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} required /></label><label className="field"><span className="field-label">渠道</span><input className="input" name="channel" placeholder="email / phone / meeting" required /></label><label className="field"><span className="field-label">结果</span><input className="input" name="outcome" placeholder="sent / replied / meeting_booked" required /></label><label className="field full"><span className="field-label">互动摘要</span><textarea className="textarea" name="summary" rows={3} required /></label><label className="field full"><span className="field-label">互动正文</span><textarea className="textarea" name="rawContent" rows={6} placeholder="粘贴邮件、消息或会议原文，供 Interpreter 提取事实" required /></label><label className="field full"><span className="field-label">提交事实（JSON 数组）</span><textarea className="textarea" name="submittedFacts" rows={3} placeholder='[{"type":"supplier_requirement","value":"完成供应商注册"}]' /></label><label className="field full"><span className="field-label">下一步动作</span><input className="input" name="nextAction" /></label><label className="field"><span className="field-label">跟进时间</span><input className="input" name="followUpAt" type="datetime-local" /></label></div>{error && <div className="error-state" role="alert">{error}</div>}{processing && <div className="badge badge-neutral" role="status">Interpreter 处理中；完成后页面会自动刷新</div>}<div><button className="button button-primary" disabled={pending}><MessageSquarePlus />{pending ? '记录中…' : '记录互动'}</button></div></form></Panel>;
}
