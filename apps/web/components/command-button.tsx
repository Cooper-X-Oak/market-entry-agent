'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

export function CommandButton({ path, label, className = 'button button-secondary', method = 'POST', body, refresh = true, confirmText, promptText }: { path: string; label: string; className?: string; method?: string; body?: unknown; refresh?: boolean; confirmText?: string; promptText?: string }) {
  const router = useRouter(); const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: (overrideBody?: unknown) => apiClient(path, { method, ...((overrideBody ?? body) !== undefined ? { body: JSON.stringify(overrideBody ?? body) } : {}) }), onSuccess: async () => { await queryClient.invalidateQueries(); if (refresh) router.refresh(); } });
  return <span className="command-control"><button className={className} disabled={mutation.isPending} onClick={() => { if (confirmText && !window.confirm(confirmText)) return; if (promptText) { const comment = window.prompt(promptText); if (!comment?.trim()) return; mutation.mutate({ ...(typeof body === 'object' && body ? body : {}), comment }); return; } mutation.mutate(undefined); }}>{mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}{mutation.isPending ? '处理中…' : label}</button>{mutation.error && <span className="command-error" role="alert">{mutation.error instanceof Error ? mutation.error.message : '操作未完成，请重试。'}</span>}</span>;
}
