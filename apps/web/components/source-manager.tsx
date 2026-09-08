'use client';

import { FileUp, Link2, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { SourceRecord } from '@/lib/types';
import { Panel } from './panel';
import { StatusBadge } from './status';

const sourceTimestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatSourceTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? '—' : sourceTimestampFormatter.format(timestamp);
}

export function SourceManager({ missionId, sources }: { missionId: string; sources: SourceRecord[] }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  async function addUrl(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); setPending(true); setError(''); const form = event.currentTarget; const data = new FormData(form); try { await apiClient(`/api/v1/missions/${missionId}/sources/url`, { method: 'POST', body: JSON.stringify({ url: data.get('url'), sourceKind: 'manual_url' }) }); form.reset(); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'URL 添加失败'); } finally { setPending(false); } }
  async function upload(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); setPending(true); setError(''); const form = event.currentTarget; const data = new FormData(form); try { await apiClient(`/api/v1/missions/${missionId}/sources/upload`, { method: 'POST', body: data }); form.reset(); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : '文件上传失败'); } finally { setPending(false); } }
  return <Panel title="企业资料来源" description="官网、公开 URL 与用户上传资料会形成不可变快照，供能力提取与后续证据引用。"><div className="stack"><div className="form-grid"><form className="field" onSubmit={addUrl}><label htmlFor="source-url">添加公开 URL</label><div style={{ display: 'flex', gap: 8 }}><input className="input" id="source-url" name="url" type="url" placeholder="https://example.com/catalog" required /><button className="button button-secondary" disabled={pending}><Link2 />添加</button></div></form><form className="field" onSubmit={upload} encType="multipart/form-data"><label htmlFor="source-file">上传企业资料</label><div style={{ display: 'flex', gap: 8 }}><input className="input" id="source-file" name="file" type="file" accept=".pdf,.docx,.xlsx,.pptx" required /><button className="button button-secondary" disabled={pending}><FileUp />上传</button></div></form></div>{pending && <div className="cell-secondary"><LoaderCircle className="animate-spin" size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />资料处理中…</div>}{error && <div className="error-state" role="alert">{error}</div>}<div>{sources.map((source) => <div key={source.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, padding: '10px 0', borderTop: '1px solid var(--border)' }}><div><div className="cell-primary">{source.title ?? source.url ?? source.id}</div><div className="cell-secondary">{source.sourceType} · 最近抓取 {formatSourceTimestamp(source.lastFetchedAt)}</div></div><StatusBadge value={source.status} /></div>)}{sources.length === 0 && <div className="cell-secondary">尚未添加资料来源。</div>}</div></div></Panel>;
}
