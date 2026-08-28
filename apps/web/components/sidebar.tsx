'use client';

import { Activity, BadgeCheck, Building2, ChartNoAxesColumn, ContactRound, GitBranch, LayoutDashboard, ListChecks, Network, Radar, RefreshCw, Route, ScrollText, Target } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';

const dashboardItem = { label: '仪表盘', href: '/dashboard', icon: LayoutDashboard };
const missionItems = [
  { label: '任务总览', segment: '', icon: ChartNoAxesColumn },
  { label: '能力证据', segment: 'capability-ledger', icon: BadgeCheck },
  { label: '市场路线', segment: 'market-routes', icon: Route },
  { label: '产业生态', segment: 'ecosystem', icon: Network },
  { label: '目标组织', segment: 'targets', icon: Target },
  { label: '触达路径', segment: 'contact-paths', icon: ContactRound },
  { label: '机会', segment: 'opportunities', icon: Radar },
  { label: '行动队列', segment: 'action-queue', icon: ListChecks },
  { label: '刷新中心', segment: 'refresh-center', icon: RefreshCw },
  { label: '决策时间线', segment: 'timeline', icon: ScrollText },
  { label: '运行记录', segment: 'runs', icon: Activity },
] as const;

export function Sidebar({ missionId, missionName }: { missionId?: string; missionName?: string }) {
  const pathname = usePathname();
  const items = missionId ? missionItems.map((item) => ({ ...item, href: `/missions/${missionId}${item.segment ? `/${item.segment}` : ''}` })) : [{ ...dashboardItem, segment: undefined }];
  return <aside className="sidebar"><Logo />{missionName && <div className="side-context"><div className="side-context-label">当前任务</div><div className="side-context-value">{missionName}</div></div>}<nav className="side-nav" aria-label="主导航">{!missionId && <Link href={dashboardItem.href} data-active={pathname === dashboardItem.href}><dashboardItem.icon /><span>{dashboardItem.label}</span></Link>}{missionId && <><Link href="/dashboard" data-active={false}><Building2 /><span>全部任务</span></Link>{items.map((item) => { const Icon = item.icon; const active = item.segment ? pathname.includes(`/${item.segment}`) : pathname === item.href; return <Link key={item.href} href={item.href} data-active={active}><Icon /><span>{item.label}</span></Link>; })}</>}</nav><div className="sidebar-footer"><GitBranch size={14} aria-hidden="true" /> 证据与版本全程可追溯</div></aside>;
}
