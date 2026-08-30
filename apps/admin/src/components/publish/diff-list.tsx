'use client';

import Link from 'next/link';
import type { DiffEntry, DiffSection } from '@/lib/data/types.ts';

const SECTION_LABEL: Record<DiffSection, string> = {
  units: 'Unidades',
  hotspots: 'Hotspots',
  scenes: 'Escenas',
  config: 'Configuración',
};

const SECTION_ORDER: DiffSection[] = ['scenes', 'hotspots', 'units', 'config'];

const KIND_COLOR: Record<DiffEntry['kind'], string> = {
  added: 'var(--ok)',
  removed: 'var(--danger)',
  modified: 'var(--warn)',
};

const KIND_LABEL: Record<DiffEntry['kind'], string> = {
  added: 'nuevo',
  removed: 'eliminado',
  modified: 'modificado',
};

/** Diff agrupado semánticamente — nunca JSON crudo. */
export function DiffList({ entries }: { entries: DiffEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>No hay cambios desde la última publicación.</p>;
  }

  const bySection = new Map<DiffSection, DiffEntry[]>();
  for (const entry of entries) {
    const list = bySection.get(entry.section) ?? [];
    list.push(entry);
    bySection.set(entry.section, list);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {SECTION_ORDER.filter((s) => bySection.has(s)).map((section) => (
        <div key={section}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
            {SECTION_LABEL[section]} ({bySection.get(section)?.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {bySection.get(section)?.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 5,
                  fontSize: 12,
                  color: 'var(--fg)',
                }}
                className="r-row"
              >
                <span
                  className="r-dot"
                  style={{ background: KIND_COLOR[entry.kind], marginTop: 5, flex: 'none' }}
                  title={KIND_LABEL[entry.kind]}
                />
                <span style={{ flex: 'none', fontWeight: 600, minWidth: 140 }}>{entry.label}</span>
                <span style={{ color: 'var(--fg-muted)' }}>{entry.detail}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
