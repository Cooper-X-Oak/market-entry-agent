'use client';

import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Building2, CalendarDays, Landmark, UserRound } from 'lucide-react';
import type { EntityRow, Relationship } from '@/lib/types';

const icons = { organization: Building2, person: UserRound, government_body: Landmark, exhibition: CalendarDays, industry_event: CalendarDays } as const;

function EntityNode({ data }: NodeProps) { const typed = data as { label: string; type: string; role: string }; const Icon = icons[typed.type as keyof typeof icons] ?? Building2; return <div style={{ minWidth: 172, maxWidth: 220, background: 'white', border: '1px solid var(--border-strong)', borderRadius: 10, padding: 10, boxShadow: '0 10px 22px -18px #0f172a' }}><Handle type="target" position={Position.Left} /><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--surface-muted)', color: 'var(--primary)' }}><Icon size={15} /></span><div><div style={{ fontWeight: 680, fontSize: 12 }}>{typed.label}</div><div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{typed.role}</div></div></div><Handle type="source" position={Position.Right} /></div>; }

export function EcosystemGraph({ entities, relationships }: { entities: EntityRow[]; relationships: Relationship[] }) {
  const nodes = entities.slice(0, 80).map((row, index) => ({ id: row.entity.id, type: 'entity', position: { x: (index % 5) * 250, y: Math.floor(index / 5) * 118 + (index % 2) * 18 }, data: { label: row.entity.canonicalName, type: row.entity.entityType, role: row.mission?.marketRoles[0] ?? row.entity.entityType } }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = relationships.filter((edge) => nodeIds.has(edge.sourceEntityId) && nodeIds.has(edge.targetEntityId)).map((edge) => ({ id: edge.id, source: edge.sourceEntityId, target: edge.targetEntityId, label: edge.relationshipType, style: { stroke: '#94a3b8' }, labelStyle: { fontSize: 9, fill: '#475569' } }));
  return <div style={{ height: 620, background: '#f6f9fc' }}><ReactFlow nodes={nodes} edges={edges} nodeTypes={{ entity: EntityNode }} fitView minZoom={0.25} maxZoom={1.6} attributionPosition="bottom-left"><Background color="#dbe3ed" gap={24} size={1} /><MiniMap pannable zoomable nodeColor="#93c5fd" maskColor="rgb(248 250 252 / .78)" /><Controls showInteractive={false} /></ReactFlow></div>;
}
