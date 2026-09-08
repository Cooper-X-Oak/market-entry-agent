import { requireAuth } from '@/lib/auth';

export default async function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return children;
}
