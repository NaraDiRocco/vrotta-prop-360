'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ProjectKind } from '@r360/core';
import type { GroupRow, ProjectRow, UnitTypeRow } from '@/lib/data/types.ts';
import type { CreateProjectResponse } from '@/app/api/p/create/route.ts';
import { slugError, slugify, uniqueSlug } from '@/lib/onboarding/slug.ts';
import {
  defaultCounts,
  expandTemplate,
  PROJECT_KINDS,
  PROJECT_TEMPLATES,
  templateSummary,
} from '@/lib/onboarding/templates.ts';
import { CsvImport } from './csv-import.tsx';
import { UnitGenerator } from './unit-generator.tsx';
import { FIELD_HINT, FIELD_LABEL, PANEL } from './shared.tsx';

/**
 * Alta de proyecto.
 *
 * Dos estados en una sola pantalla, no un wizard: primero el formulario
 * mínimo (nombre, tipo, slug, ubicación — Enter y listo), después el panel de
 * poblado (generador y CSV) sobre el proyecto ya creado. El segundo estado es
 * re-entrable por URL (`?project=slug&panel=units`), así el checklist de
 * arranque puede mandar acá sin que nadie tenga que "volver a crear" nada.
 *
 * La plantilla se propone a la derecha, con los números editables y un botón
 * para descartarla entera. Es lo único de este flujo que se parece a una
 * guía, y es donde una guía sirve: el alta es infrecuente y decide la forma
 * de todo lo que viene después.
 */
export function NewProjectScreen({
  tenantSlug,
  existingSlugs,
  initialProject,
  initialGroups,
  initialTypes,
  initialPanel,
}: {
  tenantSlug: string;
  existingSlugs: string[];
  initialProject: ProjectRow | null;
  initialGroups: GroupRow[];
  initialTypes: UnitTypeRow[];
  initialPanel: 'generate' | 'csv';
}) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectRow | null>(initialProject);
  const [groups, setGroups] = useState<GroupRow[]>(initialGroups);
  const [types, setTypes] = useState<UnitTypeRow[]>(initialTypes);
  const [notice, setNotice] = useState<string | null>(null);

  if (project) {
    return (
      <PopulatePanel
        tenantSlug={tenantSlug}
        project={project}
        groups={groups}
        types={types}
        initialPanel={initialPanel}
        notice={notice}
        onNotice={setNotice}
        onRefresh={() => router.refresh()}
      />
    );
  }

  return (
    <CreateForm
      tenantSlug={tenantSlug}
      existingSlugs={existingSlugs}
      onCreated={(response) => {
        setProject(response.project);
        setGroups([]);
        setTypes([]);
        const bits: string[] = [`Proyecto «${response.project.name}» creado.`];
        if (response.groupsCreated > 0) bits.push(`${response.groupsCreated} grupo(s)`);
        if (response.typesCreated > 0) bits.push(`${response.typesCreated} tipo(s)`);
        if (response.templateError) bits.push(`La plantilla falló: ${response.templateError}`);
        setNotice(bits.join(' · '));
        // Refresca la estructura recién creada desde el servidor.
        router.replace(`/t/${tenantSlug}/p/new?project=${encodeURIComponent(response.project.slug)}&panel=units`);
        router.refresh();
      }}
    />
  );
}

/* ── paso 1: alta mínima ──────────────────────────────────────────────── */

function CreateForm({
  tenantSlug,
  existingSlugs,
  onCreated,
}: {
  tenantSlug: string;
  existingSlugs: string[];
  onCreated: (response: CreateProjectResponse) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('loteo');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [useTemplate, setUseTemplate] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>(() => defaultCounts(PROJECT_TEMPLATES.loteo));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = PROJECT_TEMPLATES[kind];
  const effectiveSlug = slugTouched ? slug : uniqueSlug(slugify(name), existingSlugs);
  const slugProblem =
    effectiveSlug.length === 0 && name.length === 0
      ? null
      : (slugError(effectiveSlug) ?? (existingSlugs.includes(effectiveSlug) ? 'Ese slug ya está usado en este cliente.' : null));
  const summary = useMemo(() => templateSummary(template, counts), [template, counts]);
  const canSubmit = name.trim().length > 0 && slugProblem === null && !busy;

  function pickKind(next: ProjectKind) {
    setKind(next);
    setCounts(defaultCounts(PROJECT_TEMPLATES[next]));
    setUseTemplate(PROJECT_TEMPLATES[next].levels.length > 0 || PROJECT_TEMPLATES[next].unitTypes.length > 0);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const expanded = useTemplate ? expandTemplate(template, counts) : null;
      const response = await fetch('/api/p/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          name: name.trim(),
          kind,
          slug: effectiveSlug,
          location: {
            address: address.trim() || undefined,
            lat: lat.trim().length > 0 ? Number(lat) : undefined,
            lng: lng.trim().length > 0 ? Number(lng) : undefined,
          },
          ...(expanded ? { template: { groups: expanded.groups, unitTypes: expanded.unitTypes } } : {}),
        }),
      });
      const payload = (await response.json()) as CreateProjectResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No pude crear el proyecto.');
      onCreated(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude crear el proyecto.');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ padding: 12, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(320px, 420px) minmax(280px, 1fr)', alignItems: 'start', maxWidth: 900 }}
    >
      <section style={{ ...PANEL, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 3 }}>
          <label htmlFor="np-name" style={FIELD_LABEL}>
            Nombre del proyecto
          </label>
          <input
            id="np-name"
            className="r-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Baleia"
          />
        </div>

        <div style={{ display: 'grid', gap: 3 }}>
          <span style={FIELD_LABEL}>Tipo</span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {PROJECT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="r-chip"
                data-on={k === kind}
                onClick={() => pickKind(k)}
                title={PROJECT_TEMPLATES[k].description}
              >
                {PROJECT_TEMPLATES[k].label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 3 }}>
          <label htmlFor="np-slug" style={FIELD_LABEL}>
            Slug — <code style={{ color: 'var(--fg-faint)' }}>/t/{tenantSlug}/p/{effectiveSlug || '…'}</code>
          </label>
          <input
            id="np-slug"
            className="r-input"
            style={{ fontFamily: 'var(--font-mono)' }}
            value={effectiveSlug}
            spellCheck={false}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
          {slugProblem && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{slugProblem}</span>}
        </div>

        <details>
          <summary style={{ ...FIELD_LABEL, cursor: 'pointer' }}>Ubicación (opcional)</summary>
          <div style={{ display: 'grid', gap: 6, paddingTop: 7 }}>
            <input
              className="r-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Punta Ballena, Uruguay"
              aria-label="Dirección"
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="r-input tnum"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="lat -34.901110"
                inputMode="decimal"
                aria-label="Latitud"
              />
              <input
                className="r-input tnum"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="lng -55.039971"
                inputMode="decimal"
                aria-label="Longitud"
              />
            </div>
          </div>
        </details>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="submit" className="r-btn" data-variant="primary" disabled={!canSubmit}>
            {busy ? 'Creando…' : 'Crear proyecto'}
          </button>
          <Link href={`/t/${tenantSlug}/p`} className="r-btn" data-variant="ghost">
            Cancelar
          </Link>
          <span style={FIELD_HINT}>
            <span className="r-kbd">Enter</span> crea. Todo lo demás se configura después.
          </span>
        </div>
      </section>

      <section style={{ ...PANEL, display: 'grid', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 12 }}>Estructura sugerida</strong>
          {(template.levels.length > 0 || template.unitTypes.length > 0) && (
            <button
              type="button"
              className="r-btn"
              data-variant="ghost"
              style={{ height: 22 }}
              onClick={() => setUseTemplate((v) => !v)}
            >
              {useTemplate ? 'Descartar' : 'Aplicar'}
            </button>
          )}
        </div>
        <p style={FIELD_HINT}>{template.description}</p>

        {template.levels.length === 0 && template.unitTypes.length === 0 && (
          <p style={FIELD_HINT}>Este tipo no propone nada: la estructura la armás vos o la trae el CSV.</p>
        )}

        <div style={{ opacity: useTemplate ? 1 : 0.4, pointerEvents: useTemplate ? 'auto' : 'none', display: 'grid', gap: 9 }}>
          {template.levels.map((level) => (
            <div key={level.kind} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor={`lvl-${level.kind}`} style={{ flex: 1, fontSize: 12 }}>
                {level.label}
                <span style={{ ...FIELD_HINT, marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{level.codePattern}</span>
              </label>
              <input
                id={`lvl-${level.kind}`}
                className="r-input tnum"
                type="number"
                min={0}
                max={200}
                style={{ width: 70, textAlign: 'right' }}
                value={counts[level.kind] ?? level.count}
                onChange={(e) => setCounts((prev) => ({ ...prev, [level.kind]: Number(e.target.value) }))}
              />
            </div>
          ))}

          {summary.length > 0 && (
            <p style={FIELD_HINT}>
              Se crearían {summary.map((r) => `${r.total} ${r.label.toLowerCase()}`).join(' · ')}.
            </p>
          )}

          {template.unitTypes.length > 0 && (
            <div>
              <div style={{ ...FIELD_LABEL, marginBottom: 4 }}>Tipos de unidad</div>
              <ul style={{ display: 'grid', gap: 5 }}>
                {template.unitTypes.map((type) => (
                  <li key={type.code} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <strong style={{ fontSize: 12 }}>{type.name}</strong>
                      <code style={{ ...FIELD_HINT }}>{type.code}</code>
                    </div>
                    <div style={{ ...FIELD_HINT, marginTop: 3 }}>
                      {Object.keys((type.attrSchema as { properties?: Record<string, unknown> }).properties ?? {}).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </form>
  );
}

/* ── paso 2: poblar el proyecto recién creado ─────────────────────────── */

function PopulatePanel({
  tenantSlug,
  project,
  groups,
  types,
  initialPanel,
  notice,
  onNotice,
  onRefresh,
}: {
  tenantSlug: string;
  project: ProjectRow;
  groups: GroupRow[];
  types: UnitTypeRow[];
  initialPanel: 'generate' | 'csv';
  notice: string | null;
  onNotice: (message: string | null) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'generate' | 'csv'>(initialPanel);
  const template = PROJECT_TEMPLATES[project.kind];

  function done(message: string) {
    onNotice(message);
    onRefresh();
  }

  return (
    <div style={{ padding: 12, display: 'grid', gap: 12, maxWidth: 900 }}>
      {notice && (
        <div
          role="status"
          style={{
            border: '1px solid var(--ok)',
            borderRadius: 7,
            padding: '7px 10px',
            background: 'color-mix(in srgb, var(--ok) 8%, transparent)',
          }}
        >
          {notice}
        </div>
      )}

      <section style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{project.name}</div>
          <div style={FIELD_HINT}>
            {template.label} · {groups.length} grupo(s) · {types.length} tipo(s)
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link href={`/t/${tenantSlug}/p/${project.slug}`} className="r-btn" data-variant="primary">
          Ir al proyecto →
        </Link>
      </section>

      <section style={{ ...PANEL, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <button type="button" className="r-chip" data-on={tab === 'generate'} onClick={() => setTab('generate')}>
            Generar por patrón
          </button>
          <button type="button" className="r-chip" data-on={tab === 'csv'} onClick={() => setTab('csv')}>
            Importar CSV
          </button>
        </div>

        {tab === 'generate' ? (
          <UnitGenerator
            tenantSlug={tenantSlug}
            projectId={project.id}
            groups={groups}
            types={types}
            initialPattern={template.unitCodePattern}
            onDone={done}
          />
        ) : (
          <CsvImport
            tenantSlug={tenantSlug}
            projectId={project.id}
            groups={groups}
            types={types}
            onDone={done}
          />
        )}
      </section>

      <p style={FIELD_HINT}>
        Podés volver a esta pantalla cuando quieras desde el checklist de arranque del proyecto. Las unidades
        con código repetido se omiten, no se pisan.
      </p>
    </div>
  );
}
