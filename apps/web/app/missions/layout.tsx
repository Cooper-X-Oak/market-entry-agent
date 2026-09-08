import { requireAuth } from '@/lib/auth';

export default async function MissionsLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return children;
}
