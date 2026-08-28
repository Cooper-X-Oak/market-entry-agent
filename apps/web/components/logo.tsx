import { Network } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><Network aria-hidden="true" size={17} /></span>{!compact && <span className="brand-copy"><strong>Market Entry Agent</strong><span>工业品出海工作台</span></span>}</div>;
}
