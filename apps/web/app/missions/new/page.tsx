import { AppShell } from '@/components/app-shell';
import { MissionForm } from '@/components/mission-form';
import { PageHeader } from '@/components/page-header';

export default function NewMissionPage() { return <AppShell currentPage="新建市场任务"><PageHeader title="创建市场任务" description="定义企业产品范围、目标市场、成功标准和研究预算。任务创建后仍需由你确认任务卡与市场路线。" /><MissionForm /></AppShell>; }
