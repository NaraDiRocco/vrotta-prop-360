'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CreateClientResponse } from '@/app/api/admin/clients/route.ts';
import { RESERVED_TENANT_SLUGS, slugError, slugify, uniqueSlug } from '@/lib/onboarding/slug.ts';
import { FIELD_HINT, FIELD_LABEL, PANEL } from './shared.tsx';

/**
 * Alta de cliente (tenant): quien contrata el producto — una inmobiliaria o
 * una desarrolladora. Dos campos, porque un cliente nuevo no tiene todavía
 * nada que configurar: sus proyectos vienen después.
 *
 * NO pide el email del primer Administrador: invitarlo es el sistema de
 * invitaciones (P2c, todavía no existe) y un campo que no manda nada sería
 * un formulario que miente. Hasta que eso exista, Vrotta carga el proyecto
 * desde acá mismo y el cliente entra cuando lo inviten.
 */
export function NewTenantScreen({ existingSlugs }: { existingSlugs: string[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = touched ? slug : uniqueSlug(slugify(name), existingSlugs);
  const problem =
    name.length === 0 && effectiveSlug.length === 0
      ? null
      : (slugError(effectiveSlug, { reserved: RESERVED_TENANT_SLUGS }) ??
        (existingSlugs.includes(effectiveSlug) ? 'Ya existe un cliente con ese slug.' : null));
  const canSubmit = name.trim().length > 0 && problem === null && !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: effectiveSlug, name: name.trim() }),
      });
      const payload = (await response.json()) as CreateClientResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No pude crear el cliente.');
      router.push(`/t/${payload.tenant.slug}/p`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude crear el cliente.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...PANEL, display: 'grid', gap: 10, maxWidth: 420 }}>
      <div style={{ display: 'grid', gap: 3 }}>
        <label htmlFor="nt-name" style={FIELD_LABEL}>
          Nombre del cliente
        </label>
        <input
          id="nt-name"
          className="r-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Dacal Bienes Raíces"
        />
      </div>

      <div style={{ display: 'grid', gap: 3 }}>
        <label htmlFor="nt-slug" style={FIELD_LABEL}>
          Slug — <code style={{ color: 'var(--fg-faint)' }}>/t/{effectiveSlug || '…'}</code>
        </label>
        <input
          id="nt-slug"
          className="r-input"
          style={{ fontFamily: 'var(--font-mono)' }}
          value={effectiveSlug}
          spellCheck={false}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value);
          }}
        />
        {problem && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{problem}</span>}
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="submit" className="r-btn" data-variant="primary" disabled={!canSubmit}>
          {busy ? 'Creando…' : 'Crear cliente'}
        </button>
        <Link href="/admin" className="r-btn" data-variant="ghost">
          Cancelar
        </Link>
        <span style={FIELD_HINT}>El cliente entra cuando lo inviten; por ahora, Vrotta carga el proyecto.</span>
      </div>
    </form>
  );
}
