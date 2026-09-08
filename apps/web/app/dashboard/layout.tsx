import { requireAuth } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return children;
}
