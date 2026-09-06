'use client';

import { useMemo, useState } from 'react';
import type { UnitStatus } from '@r360/core';
import { StatusBar } from '@/components/status.tsx';
import type { GroupRow, StatusCounts } from '@/lib/data/types.ts';
import { emptyCounts } from '@/lib/units/query.ts';

export interface GroupCounts {
  [groupId: string]: { total: number; counts: Record<UnitStatus, number> };
}

interface Node {
  group: GroupRow;
  children: Node[];
  /** Ids del subárbol, incluido el propio: click = filtrar por todo el subárbol. */
  subtree: string[];
  total: number;
  counts: StatusCounts;
}

function addCounts(a: StatusCounts, b: StatusCounts): StatusCounts {
  return {
    disponible: a.disponible + b.disponible,
    reservado: a.reservado + b.reservado,
    vendido: a.vendido + b.vendido,
    bloqueado: a.bloqueado + b.bloqueado,
    no_disponible: a.no_disponible + b.no_disponible,
    proximamente: a.proximamente + b.proximamente,
  };
}

export function buildTree(groups: readonly GroupRow[], counts: GroupCounts): Node[] {
  const byParent = new Map<string | null, GroupRow[]>();
  for (const group of groups) {
    const siblings = byParent.get(group.parentId) ?? [];
    siblings.push(group);
    byParent.set(group.parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));

  function build(group: GroupRow): Node {
    const children = (byParent.get(group.id) ?? []).map(build);
    const own = counts[group.id] ?? { total: 0, counts: emptyCounts() };
    let total = own.total;
    let acc = own.counts;
    const subtree = [group.id];
    for (const child of children) {
      total += child.total;
      acc = addCounts(acc, child.counts);
      subtree.push(...child.subtree);
    }
    return { group, children, subtree, total, counts: acc };
  }

  return (byParent.get(null) ?? []).map(build);
}

/**
 * Árbol de grupos. Un click filtra por el SUBÁRBOL completo, no por el grupo
 * solo: elegir "Etapa 1" tiene que traer los lotes de sus manzanas, que es
 * donde viven las unidades.
 */
export function GroupTree({
  groups,
  counts,
  selected,
  onSelect,
}: {
  groups: readonly GroupRow[];
  counts: GroupCounts;
  selected: string[];
  onSelect: (subtree: string[]) => void;
}) {
  const tree = useMemo(() => buildTree(groups, counts), [groups, counts]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rootTotal = tree.reduce((acc, node) => acc + node.total, 0);
  const unassigned = counts['']?.total ?? 0;

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(node: Node, depth: number) {
    const isSelected = node.subtree.every((id) => selectedSet.has(id)) && selectedSet.size === node.subtree.length;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.group.id);
    return (
      <li key={node.group.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 26,
            paddingLeft: 4 + depth * 10,
            paddingRight: 6,
            borderRadius: 4,
            background: isSelected ? 'var(--bg-sel)' : 'transparent',
          }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleCollapse(node.group.id)}
            aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
            style={{
              width: 12,
              color: 'var(--fg-faint)',
              visibility: hasChildren ? 'visible' : 'hidden',
              fontSize: 9,
            }}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
          <button
            type="button"
            onClick={() => onSelect(node.subtree)}
            title={`${node.group.name ?? node.group.code} · ${node.total} unidades`}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: isSelected ? 600 : 400,
            }}
          >
            {node.group.code}
            <span style={{ color: 'var(--fg-faint)', marginLeft: 5, fontSize: 11 }}>{node.group.kind}</span>
          </button>
          <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {node.total}
          </span>
        </div>
        <div style={{ padding: `0 6px 3px ${16 + depth * 10}px` }}>
          <StatusBar counts={node.counts} height={3} />
        </div>
        {hasChildren && !isCollapsed && (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <aside
      aria-label="Grupos"
      style={{
        width: 200,
        flex: 'none',
        borderRight: '1px solid var(--border)',
        overflow: 'auto',
        padding: 6,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect([])}
        onKeyDown={(e) => e.key === 'Enter' && onSelect([])}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 26,
          padding: '0 6px',
          borderRadius: 4,
          cursor: 'pointer',
          background: selected.length === 0 ? 'var(--bg-sel)' : 'transparent',
          fontWeight: selected.length === 0 ? 600 : 400,
        }}
      >
        <span>Todo el proyecto</span>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {rootTotal + unassigned}
        </span>
      </div>
      <ul>{tree.map((node) => renderNode(node, 0))}</ul>
      {unassigned > 0 && (
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', padding: '6px' }}>
          {unassigned} sin grupo asignado
        </div>
      )}
    </aside>
  );
}
