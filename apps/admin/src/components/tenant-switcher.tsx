'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { ROLE_LABEL } from '@/lib/roles.ts';
import type { Membership, TenantRef } from '@/lib/data/types.ts';

/**
 * Conmutador de cliente, arriba de todo en el rail.
 *
 * El caso real es una persona saltando entre varios clientes: dos iniciales no
 * alcanzan para saber dónde está parada. Acá el avatar dice en cuál está y el
 * popover lista todos los que tiene, con "Nuevo cliente" al pie — que es una
 * acción de setup y no tenía por qué competir con la navegación diaria del rail.
 *
 * Con un solo cliente no hay popover: el avatar es el link al listado, como antes.
 *
 * `allTenants` es el caso de plataforma: Vrotta ve TODOS los clientes, no sólo
 * los que tiene en `memberships` (que para un actor de plataforma están
 * vacíos). Con más de ~8 aparece un buscador — a partir de un puñado de
 * clientes desplazarse con el ojo deja de alcanzar. Quien llama (`AppShell`)
 * decide si pasa `allTenants`: sin él, el conmutador se comporta exactamente
 * como antes.
 */
export function TenantSwitcher({
  current,
  memberships,
  allTenants,
  canCreateTenant,
}: {
  current: Membership;
  memberships: Membership[];
  /** Todos los clientes visibles para un actor de plataforma. Ausente = comportamiento de siempre (sólo `memberships`). */
  allTenants?: TenantRef[];
  /** "Nuevo cliente" sólo tiene sentido para quien puede crear tenants (Vrotta Admin). */
  canCreateTenant?: boolean;
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
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const platform = allTenants !== undefined;
  const filteredTenants = useMemo(() => {
    if (!allTenants) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return allTenants;
    return allTenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [allTenants, query]);

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
            minWidth: 240,
            maxHeight: 'min(70vh, 480px)',
            overflowY: 'auto',
            padding: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-overlay)',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', padding: '4px 8px 6px' }}>Clientes</div>

          {platform && (allTenants?.length ?? 0) > 8 && (
            <input
              autoFocus
              className="r-input"
              placeholder="Buscar cliente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ margin: '0 4px 6px', width: 'calc(100% - 8px)', height: 26, fontSize: 12 }}
            />
          )}

          {platform
            ? filteredTenants.map((t) => {
                const active = t.slug === current.tenantSlug;
                return (
                  <Link
                    key={t.slug}
                    href={`/t/${t.slug}/p`}
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
                      {t.name}
                    </span>
                  </Link>
                );
              })
            : memberships.map((m) => {
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

          {platform && (
            <Link
              href="/admin"
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
                fontSize: 11,
              }}
            >
              Ver como lista — Clientes
            </Link>
          )}

          {/* "Nuevo cliente" ya no es para cualquiera: crear un tenant es cosa
              de Vrotta Admin (`canCreateTenant`, /admin/clients/new). Antes
              de la migración de roles esto se mostraba a cualquier owner y
              apuntaba a `/t/new`, que ya no existe. */}
          {canCreateTenant && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <Link
                href="/admin/clients/new"
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
