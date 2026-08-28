import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { SseBridge } from '@/components/sse-bridge';
import { safeApi } from '@/lib/api';
import type { Mission } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ missionId: string }> }): Promise<Metadata> { const { missionId } = await params; const result = await safeApi<Mission>(`/api/v1/missions/${missionId}`); return { title: result.data?.name ?? '市场任务' }; }

export default async function MissionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ missionId: string }> }) { const { missionId } = await params; const result = await safeApi<Mission>(`/api/v1/missions/${missionId}`); return <AppShell currentPage="市场任务工作台" missionId={missionId} missionName={result.data?.name ?? '任务不可用'}><SseBridge missionId={missionId} />{children}</AppShell>; }
