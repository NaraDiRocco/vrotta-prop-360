'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { ROLE_LABEL } from '@/lib/roles.ts';
import type { Membership } from '@/lib/data/types.ts';

/**
 * Conmutador de cliente, arriba de todo en el rail.
 *
 * El caso real es una persona saltando entre varios clientes: dos iniciales no
 * alcanzan para saber dónde está parada. Acá el avatar dice en cuál está y el
 * popover lista todos los que tiene, con "Nuevo cliente" al pie — que es una
 * acción de setup y no tenía por qué competir con la navegación diaria del rail.
 *
 * Con un solo cliente no hay popover: el avatar es el link al listado, como antes.
 */
export function TenantSwitcher({ current, memberships }: { current: Membership; memberships: Membership[] }) {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(event: MouseEvent) {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = current.tenantName.slice(0, 2).toUpperCase();

  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${current.tenantName} — cambiar de cliente`}
        aria-label={`Cliente actual: ${current.tenantName}. Cambiar de cliente`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '3px 4px 3px 3px',
          border: '1px solid transparent',
          borderRadius: 8,
          background: open ? 'var(--bg-hover)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 7,
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {initials}
        </span>
        <ChevronDown size={12} strokeWidth={2} color="var(--fg-faint)" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Clientes"
          style={{
            position: 'absolute',
            top: 4,
            left: 'calc(100% + 6px)',
            zIndex: 30,
            minWidth: 220,
            padding: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-overlay)',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', padding: '4px 8px 6px' }}>Clientes</div>
          {memberships.map((m) => {
            const active = m.tenantSlug === current.tenantSlug;
            return (
              <Link
                key={m.tenantSlug}
                href={`/t/${m.tenantSlug}/p`}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 30,
                  padding: '0 8px',
                  borderRadius: 'var(--radius-control)',
                  color: active ? 'var(--accent)' : 'var(--fg)',
                  background: active ? 'var(--bg-sel)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ width: 14, display: 'grid', placeItems: 'center' }}>
                  {active ? <Check size={13} strokeWidth={2.25} aria-hidden /> : null}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.tenantName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{ROLE_LABEL[m.role]}</span>
              </Link>
            );
          })}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <Link
            href="/t/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 30,
              padding: '0 8px',
              borderRadius: 'var(--radius-control)',
              color: 'var(--fg-muted)',
            }}
          >
            <span style={{ width: 14, display: 'grid', placeItems: 'center' }}>
              <Plus size={13} strokeWidth={2} aria-hidden />
            </span>
            Nuevo cliente
          </Link>
        </div>
      )}
    </div>
  );
}
