'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { ROLE_LABEL } from '@/lib/roles.ts';
import type { Membership, TenantRef } from '@/lib/data/types.ts';

/**
 * Conmutador de cliente: la cabecera del sidebar y el nivel 0 de la
 * navegación ("¿en qué inmobiliaria estoy?").
 *
 * Antes vivía en un rail de 64px y sólo cabían dos iniciales. Con 240px el
 * avatar convive con el nombre completo, así que ya no hace falta abrir el
 * popover para saber dónde estás. Cuando el sidebar se colapsa, el CSS
 * (`.shell-hide-collapsed`) esconde el nombre y queda el avatar: el markup no
 * cambia, así que tampoco cambia lo que lee un lector de pantalla.
 *
 * `allTenants` es el caso de plataforma: Vrotta ve TODOS los clientes, no sólo
 * los que tiene en `memberships` (que para un actor de plataforma están
 * vacíos). Con más de ~8 aparece un buscador. Además, para plataforma el
 * popover abre con la línea "Operando en <cliente> como <rol>": esa línea y el
 * distintivo del avatar reemplazan a la banda azul de 22px que antes repetía
 * lo mismo en todas las pantallas, ocupando alto de tabla.
 *
 * En `scope="platform"` (las pantallas `/admin`, donde todavía no hay ningún
 * cliente elegido) la cabecera dice "Vrotta" y el popover sirve para entrar a
 * un cliente.
 */
export function TenantSwitcher({
  current,
  memberships,
  allTenants,
  canCreateTenant,
  platform = false,
  actorLabel,
  scope = 'tenant',
}: {
  /** El cliente que se está operando. En `scope="platform"` no hay ninguno. */
  current?: Membership;
  memberships: Membership[];
  /** Todos los clientes visibles para un actor de plataforma. */
  allTenants?: TenantRef[];
  /** "Nuevo cliente" sólo tiene sentido para quien puede crear tenants (Vrotta Admin). */
  canCreateTenant?: boolean;
  /** Quien opera es de Vrotta: avatar con distintivo y línea de contexto. */
  platform?: boolean;
  /** `actorLabel(actor)` — para la línea "Operando en … como …". */
  actorLabel?: string;
  scope?: 'tenant' | 'platform';
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

  const useAllTenants = allTenants !== undefined;
  const filteredTenants = useMemo(() => {
    if (!allTenants) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return allTenants;
    return allTenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [allTenants, query]);

  const title = scope === 'platform' ? 'Vrotta' : (current?.tenantName ?? 'Vrotta');
  const initials = scope === 'platform' ? 'V' : title.slice(0, 2).toUpperCase();
  const subtitle = scope === 'platform' ? (actorLabel ?? 'Plataforma') : 'Cliente';

  return (
    <div ref={hostRef} className="shell-pop-host">
      <button
        type="button"
        className="shell-row-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          scope === 'platform'
            ? 'Vrotta — elegir un cliente'
            : `Cliente actual: ${title}. Cambiar de cliente`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ background: open ? 'var(--bg-hover)' : undefined }}
      >
        <span className="shell-avatar">
          {initials}
          {platform && scope === 'tenant' && (
            <span className="shell-avatar-badge" title="Operado por Vrotta">
              <Building2 size={9} strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </span>
        <span className="shell-row-main shell-hide-collapsed">
          <span className="shell-row-title">{title}</span>
          <span className="shell-row-sub">{subtitle}</span>
        </span>
        <ChevronsUpDown size={13} strokeWidth={2} className="shell-hide-collapsed" style={{ flex: 'none', color: 'var(--fg-muted)' }} aria-hidden />
      </button>

      {open && (
        <div role="menu" aria-label="Clientes" className="shell-pop" style={{ top: 'calc(100% + 4px)', left: 0 }}>
          {platform && scope === 'tenant' && current && (
            <div className="shell-pop-head">
              Operando en <strong style={{ color: 'var(--fg)' }}>{current.tenantName}</strong>
              {actorLabel ? ` como ${actorLabel}` : ''}
            </div>
          )}
          {!(platform && scope === 'tenant') && <div className="shell-pop-head">Clientes</div>}

          {useAllTenants && (allTenants?.length ?? 0) > 8 && (
            <input
              autoFocus
              className="r-input"
              placeholder="Buscar cliente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ margin: '0 4px 6px', width: 'calc(100% - 8px)' }}
            />
          )}

          {useAllTenants
            ? filteredTenants.map((t) => {
                const active = t.slug === current?.tenantSlug;
                return (
                  <Link
                    key={t.slug}
                    href={`/t/${t.slug}/p`}
                    role="menuitem"
                    className="shell-menuitem"
                    data-active={active || undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span style={{ width: 14, display: 'grid', placeItems: 'center', flex: 'none' }}>
                      {active ? <Check size={13} strokeWidth={2.25} aria-hidden /> : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                  </Link>
                );
              })
            : memberships.map((m) => {
                const active = m.tenantSlug === current?.tenantSlug;
                return (
                  <Link
                    key={m.tenantSlug}
                    href={`/t/${m.tenantSlug}/p`}
                    role="menuitem"
                    className="shell-menuitem"
                    data-active={active || undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span style={{ width: 14, display: 'grid', placeItems: 'center', flex: 'none' }}>
                      {active ? <Check size={13} strokeWidth={2.25} aria-hidden /> : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.tenantName}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{ROLE_LABEL[m.role]}</span>
                  </Link>
                );
              })}

          {/* "Nuevo cliente" ya no es para cualquiera: crear un tenant es cosa
              de Vrotta Admin (`canCreateTenant`, /admin/clients/new). */}
          {canCreateTenant && (
            <>
              <div className="shell-menu-sep" />
              <Link href="/admin/clients/new" role="menuitem" className="shell-menuitem" onClick={() => setOpen(false)}>
                <span style={{ width: 14, display: 'grid', placeItems: 'center', flex: 'none' }}>
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
