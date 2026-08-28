import { CircleAlert, Inbox } from 'lucide-react';
import Link from 'next/link';

export function EmptyState({ title, description, actionLabel, actionHref }: { title: string; description: string; actionLabel?: string; actionHref?: string }) { return <div className="empty-state"><div><div className="empty-state-icon"><Inbox size={21} /></div><h3>{title}</h3><p>{description}</p>{actionLabel && actionHref && <Link className="button button-primary" href={actionHref}>{actionLabel}</Link>}</div></div>; }
export function ErrorState({ message }: { message: string }) { return <div className="error-state" role="alert"><strong><CircleAlert size={16} style={{ verticalAlign: '-3px', marginRight: 7 }} />数据暂时不可用</strong><div style={{ marginTop: 5 }}>{message}</div></div>; }
export function TableSkeleton({ rows = 6 }: { rows?: number }) { return <div className="panel"><div className="panel-body">{Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton" style={{ height: 38, marginBottom: index === rows - 1 ? 0 : 10 }} />)}</div></div>; }
