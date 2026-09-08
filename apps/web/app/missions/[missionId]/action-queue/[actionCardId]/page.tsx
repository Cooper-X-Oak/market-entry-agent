import { Check, Download, RefreshCw, Send } from 'lucide-react';
import { ActionCardEditor } from '@/components/action-card-editor';
import { CommandButton } from '@/components/command-button';
import { ErrorState } from '@/components/states';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status';
import { safeApi } from '@/lib/api';
import type { ActionCardRow } from '@/lib/types';

export default async function ActionCardPage({ params }: { params: Promise<{ missionId: string; actionCardId: string }> }) {
  const { missionId, actionCardId } = await params;
  const result = await safeApi<ActionCardRow>(`/api/v1/missions/${missionId}/action-cards/${actionCardId}`);
  if (!result.data) return <ErrorState message={result.error?.message ?? '行动卡不存在'} />;
  const { actionCard: card, opportunity } = result.data;
  const canEdit = ['draft', 'review', 'changes_requested'].includes(card.status);
  const canApprove = card.status === 'review';
  const canRequestChanges = card.status === 'review';
  const canExport = ['approved', 'exported', 'executed', 'completed'].includes(card.status);
  const canExecute = card.cardType === 'outreach' && ['approved', 'exported'].includes(card.status);
  return <>
    <PageHeader title={card.objective} description={`${opportunity.title} · 行动卡版本 ${card.versionNo} · ${card.cardType === 'outreach' ? (card.channel ?? '公开渠道') : '补充研究'}`} actions={<><StatusBadge value={card.cardType} /><StatusBadge value={card.status} />{canExport && <><a className="button button-secondary" href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1/missions/${missionId}/action-cards/${card.id}/export?format=markdown`}><Download />Markdown</a><a className="button button-secondary" href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1/missions/${missionId}/action-cards/${card.id}/export?format=csv`}><Download />CSV</a></>}<CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/regenerate`} label="重新生成" className="button button-secondary" />{canApprove && <CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/decision`} body={{ decision: 'approve', expectedVersionNo: card.versionNo }} label="批准" className="button button-primary" />}</>} />
    <div className="split-layout">
      <div className="stack">{canEdit ? <ActionCardEditor missionId={missionId} card={card} /> : <Panel title="已锁定行动内容" description="批准或执行后的版本保留为可追溯交付。"><div className="stack"><Summary label="行动目标" value={card.objective} /><Summary label="行动理由" value={card.contactReason} /><Summary label="当前时机" value={card.timingReason} /><Summary label="目标角色利益" value={card.stakeholderInterest} /><Summary label="价值主张" value={card.valueHypothesis} />{card.cardType === 'outreach' && <><Summary label="邮件主题" value={card.emailSubject ?? '—'} /><Summary label="邮件正文" value={card.emailBody ?? '—'} /></>}</div></Panel>}{card.cardType === 'research' && <Panel title="补充研究计划" description="用于找到公开联系路径或验证关键未知项。"><div className="stack"><Summary label="目标角色" value={card.targetRoleLabel} /><Summary label="待确认事项" value={card.unknowns.join('\n') || '—'} /><Summary label="研究步骤" value={card.researchPlan.join('\n') || '—'} /></div></Panel>}</div>
      <div className="stack"><Panel title="执行控制" description="批准是 BM1 的最后业务判断。"><div className="stack">{canApprove && <CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/decision`} body={{ decision: 'approve', expectedVersionNo: card.versionNo }} label="批准行动卡" className="button button-primary" />}{canRequestChanges && <CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/decision`} body={{ decision: 'request_changes', expectedVersionNo: card.versionNo }} promptText="请输入必须落实的修改意见" label="请求修改" className="button button-secondary" />}{canExecute && <CommandButton path={`/api/v1/missions/${missionId}/action-cards/${card.id}/execute`} label="标记已执行" className="button button-secondary" confirmText="仅在已经完成实际外联后确认。是否继续？" />}{!canApprove && !canRequestChanges && !canExecute && <div className="cell-secondary">当前状态没有待执行命令。</div>}</div></Panel><Panel title="版本与跟进"><div className="stack"><Meta icon={<RefreshCw />} label="版本" value={String(card.versionNo)} /><Meta icon={<Check />} label="状态" value={card.status} /><Meta icon={<Send />} label="类型" value={card.cardType === 'outreach' ? (card.channel ?? '公开外联') : '补充研究'} />{card.dueAt && <Meta icon={<RefreshCw />} label="到期" value={new Date(card.dueAt).toLocaleString('zh-CN')} />}</div></Panel></div>
    </div>
  </>;
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div style={{ display: 'grid', gridTemplateColumns: '20px 82px 1fr', gap: 8, alignItems: 'center' }}><span style={{ color: 'var(--text-secondary)' }}>{icon}</span><span className="cell-secondary">{label}</span><strong>{value}</strong></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><div className="cell-secondary">{label}</div><div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{value}</div></div>; }
