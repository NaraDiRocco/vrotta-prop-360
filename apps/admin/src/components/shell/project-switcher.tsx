'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { ProjectRef } from '@/lib/data/types.ts';

/**
 * Encabezado del grupo "Proyecto" del sidebar, con salto a otro proyecto del
 * mismo cliente.
 *
 * Antes, estando dentro de un proyecto, cambiar de proyecto era volver a la
 * lista: dos navegaciones para una tarea que se hace todo el día. Acá es un
 * popover, con la misma mecánica que el conmutador de cliente (buscador a
 * partir de 8, Esc, click afuera) para no inventar un segundo idioma.
 *
 * Con un solo proyecto no hay nada que conmutar: se dibuja el nombre y listo.
 */
export function ProjectSwitcher({
  tenant,
  current,
  projects,
}: {
  tenant: string;
  current: ProjectRef;
  projects: ProjectRef[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(event: MouseEvent) {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [projects, query]);

  const alone = projects.length <= 1;

  const body = (
    <span className="shell-row-main" style={{ minWidth: 0 }}>
      <span className="shell-row-title">{current.name}</span>
      <span className="shell-row-sub">{current.kind}</span>
    </span>
  );

  if (alone) {
    return (
      <div className="shell-group-head shell-hide-collapsed" style={{ paddingTop: 2 }}>
        {body}
      </div>
    );
  }

  return (
    <div ref={hostRef} className="shell-pop-host shell-hide-collapsed" style={{ padding: '2px 4px 0' }}>
      <button
        type="button"
        className="shell-row-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Proyecto actual: ${current.name}. Cambiar de proyecto`}
        style={{ background: open ? 'var(--bg-hover)' : undefined }}
      >
        {body}
        <ChevronsUpDown size={13} strokeWidth={2} style={{ flex: 'none', color: 'var(--fg-muted)' }} aria-hidden />
      </button>

      {open && (
        <div role="menu" aria-label="Proyectos" className="shell-pop" style={{ top: 'calc(100% + 4px)', left: 4 }}>
          <div className="shell-pop-head">Proyectos de este cliente</div>
          {projects.length > 8 && (
            <input
              autoFocus
              className="r-input"
              placeholder="Buscar proyecto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ margin: '0 4px 6px', width: 'calc(100% - 8px)' }}
            />
          )}
          {filtered.map((p) => {
            const active = p.slug === current.slug;
            return (
              <Link
                key={p.slug}
                href={`/t/${tenant}/p/${p.slug}`}
                role="menuitem"
                className="shell-menuitem"
                data-active={active || undefined}
                onClick={() => setOpen(false)}
              >
                <span style={{ width: 14, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  {active ? <Check size={13} strokeWidth={2.25} aria-hidden /> : null}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{p.kind}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
