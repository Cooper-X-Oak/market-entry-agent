import { Bell, ChevronRight, CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { Sidebar } from './sidebar';
import { LogoutButton } from './logout-button';

export function AppShell({ children, missionId, missionName, currentPage }: { children: React.ReactNode; missionId?: string; missionName?: string; currentPage: string }) {
  return <div className="app-shell"><Sidebar missionId={missionId} missionName={missionName} /><div className="app-main"><header className="topbar"><div className="breadcrumbs"><Link href="/workspaces">工作区</Link><ChevronRight size={14} aria-hidden="true" />{missionName && <><span>{missionName}</span><ChevronRight size={14} aria-hidden="true" /></>}<strong>{currentPage}</strong></div><div className="top-actions"><button className="button button-ghost icon-button" aria-label="帮助"><CircleHelp /></button><button className="button button-ghost icon-button" aria-label="通知"><Bell /></button><LogoutButton /></div></header><main className="page-content">{children}</main></div></div>;
}
