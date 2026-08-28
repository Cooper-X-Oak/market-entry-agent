import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = { title: { default: '工业品市场进入 Agent', template: '%s · 市场进入 Agent' }, description: '以证据驱动的工业品出海市场进入工作台' };

const directionContract = `THESIS: 这是证据、组织和动作在同一工作台中闭环的操作系统，拒绝用营销式首页替代真实任务状态。
OWN-WORLD: PRD 固定的冷静浅色工作面、深蓝导航、1px 证据边界、紧凑表格、明确状态色和 10–12px 工具型圆角。
STORY: 用户先看当前任务和待办，再沿能力、路线、生态、目标、联系人、机会和行动队列完成判断与审批。
FIRST VIEWPORT: 64px 顶栏下直接呈现任务状态、阶段进度和核心指标，主操作位于标题右侧，证据与待办无需滚动即可发现。
FORM: Desktop B2B evidence workbench; PRD-pinned direction, no concept seed required.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><template data-design-contract dangerouslySetInnerHTML={{ __html: `<!-- ${directionContract} -->` }} /><Providers>{children}</Providers></body></html>;
}
