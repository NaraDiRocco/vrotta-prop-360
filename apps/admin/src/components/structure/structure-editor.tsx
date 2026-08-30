'use client';

import { useMemo, useState } from 'react';
import type { GroupRow, UnitTypeRow } from '@/lib/data/types.ts';
import type { StructureSaveResponse } from '@/app/api/p/[project]/structure/route.ts';
import { normalizeAttrSchema, type AttrPrimitive, type SchemaImpact } from '@/lib/units/attrs.ts';

type Draft = { id: string; parentId: string | null; kind: string; code: string; name: string | null; sort: number };

/**
 * Editor de estructura: árbol de grupos (drag & drop) + tipos de unidad con su
 * attr_schema.
 *
 * El drag & drop es HTML5 nativo. Soltar SOBRE un grupo lo hace hijo; soltar en
 * la franja de arriba lo pone como hermano anterior. Sin librería: son 40
 * líneas y una dependencia menos que auditar.
 */
export function StructureEditor({
  projectId,
  initialGroups,
  initialTypes,
}: {
  projectId: string;
  initialGroups: GroupRow[];
  initialTypes: UnitTypeRow[];
}) {
  const [groups, setGroups] = useState<Draft[]>(initialGroups.map((g) => ({ ...g })));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const byParent = useMemo(() => {
    const map = new Map<string | null, Draft[]>();
    for (const group of groups) {
      const list = map.get(group.parentId) ?? [];
      list.push(group);
      map.set(group.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort - b.sort);
    return map;
  }, [groups]);

  function descendants(id: string, acc: Set<string> = new Set()): Set<string> {
    acc.add(id);
    for (const child of byParent.get(id) ?? []) descendants(child.id, acc);
    return acc;
  }

  function reparent(id: string, parentId: string | null) {
    // Nunca dejar que un grupo sea su propio ancestro: eso cuelga el render.
    if (parentId !== null && descendants(id).has(parentId)) {
      setMessage('No podés mover un grupo dentro de sí mismo.');
      return;
    }
    setGroups((prev) =>
      prev.map((group) => (group.id === id ? { ...group, parentId, sort: nextSort(prev, parentId) } : group)),
    );
    setDirty(true);
    setMessage(null);
  }

  function nextSort(list: Draft[], parentId: string | null): number {
    const siblings = list.filter((g) => g.parentId === parentId);
    return siblings.reduce((max, g) => Math.max(max, g.sort), 0) + 1;
  }

  function rename(id: string, patch: Partial<Draft>) {
    setGroups((prev) => prev.map((group) => (group.id === id ? { ...group, ...patch } : group)));
    setDirty(true);
  }

  function addGroup(parentId: string | null) {
    const id = `new-${crypto.randomUUID()}`;
    setGroups((prev) => [
      ...prev,
      { id, parentId, kind: 'grupo', code: 'NUEVO', name: null, sort: nextSort(prev, parentId) },
    ]);
    setDirty(true);
  }

  async function saveGroups() {
    const response = await fetch(`/api/p/${projectId}/structure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'groups', groups }),
    });
    setMessage(response.ok ? 'Grupos guardados.' : 'No pude guardar los grupos.');
    if (response.ok) setDirty(false);
  }

  function renderNode(group: Draft, depth: number) {
    const children = byParent.get(group.id) ?? [];
    return (
      <li key={group.id}>
        <div
          draggable
          onDragStart={() => setDragging(group.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragging && dragging !== group.id) reparent(dragging, group.id);
            setDragging(null);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 30,
            paddingLeft: 4 + depth * 14,
            borderBottom: '1px solid var(--border)',
            opacity: dragging === group.id ? 0.4 : 1,
            cursor: 'grab',
          }}
        >
          <span style={{ color: 'var(--fg-faint)' }}>⠿</span>
          <input
            className="r-input"
            style={{ width: 90, height: 22, fontFamily: 'var(--font-mono)' }}
            value={group.code}
            onChange={(e) => rename(group.id, { code: e.target.value.toUpperCase() })}
            aria-label="Código"
          />
          <input
            className="r-input"
            style={{ width: 150, height: 22 }}
            value={group.name ?? ''}
            placeholder="Nombre"
            onChange={(e) => rename(group.id, { name: e.target.value || null })}
            aria-label="Nombre"
          />
          <input
            className="r-input"
            style={{ width: 90, height: 22 }}
            value={group.kind}
            placeholder="tipo"
            onChange={(e) => rename(group.id, { kind: e.target.value })}
            aria-label="Clase de grupo (manzana, torre, piso…)"
          />
          <button type="button" className="r-btn" data-variant="ghost" onClick={() => addGroup(group.id)}>
            + hijo
          </button>
        </div>
        {children.length > 0 && <ul>{children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, padding: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <section style={{ flex: '1 1 460px', minWidth: 360 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600 }}>Grupos</h2>
          <button type="button" className="r-btn" onClick={() => addGroup(null)}>
            + raíz
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="r-btn" data-variant="primary" disabled={!dirty} onClick={saveGroups}>
            Guardar grupos
          </button>
        </header>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragging) reparent(dragging, null);
            setDragging(null);
          }}
          style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}
        >
          <ul>{(byParent.get(null) ?? []).map((group) => renderNode(group, 0))}</ul>
          <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--fg-faint)' }}>
            Arrastrá un grupo sobre otro para anidarlo, o acá abajo para dejarlo en la raíz.
          </div>
        </div>
        {message && <p style={{ marginTop: 6, color: 'var(--fg-muted)' }}>{message}</p>}
      </section>

      <section style={{ flex: '1 1 380px', minWidth: 340 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tipos de unidad</h2>
        {initialTypes.map((type) => (
          <TypeEditor key={type.id} projectId={projectId} type={type} />
        ))}
      </section>
    </div>
  );
}

const TYPES: AttrPrimitive[] = ['string', 'number', 'integer', 'boolean'];

function TypeEditor({ projectId, type }: { projectId: string; type: UnitTypeRow }) {
  const [schema, setSchema] = useState(() => normalizeAttrSchema(type.attrSchema));
  const [impact, setImpact] = useState<SchemaImpact | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toJsonSchema() {
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([key, prop]) => [
          key,
          {
            ...(prop.type ? { type: prop.type } : {}),
            ...(prop.title ? { title: prop.title } : {}),
            ...(prop.enum ? { enum: prop.enum } : {}),
          },
        ]),
      ),
      required: schema.required,
      additionalProperties: schema.additionalProperties,
    };
  }

  async function post(dryRun: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/p/${projectId}/structure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'type', dryRun, type: { ...type, attrSchema: toJsonSchema() } }),
      });
      const body = (await response.json()) as StructureSaveResponse;
      setImpact(body.impact ?? null);
      setSaved(body.saved ? 'Guardado.' : null);
    } finally {
      setBusy(false);
    }
  }

  function setProp(key: string, patch: Partial<{ type: AttrPrimitive; title: string }>) {
    setSchema((prev) => ({
      ...prev,
      properties: { ...prev.properties, [key]: { ...prev.properties[key], ...patch } },
    }));
    setImpact(null);
    setSaved(null);
  }

  function toggleRequired(key: string) {
    setSchema((prev) => ({
      ...prev,
      required: prev.required.includes(key) ? prev.required.filter((k) => k !== key) : [...prev.required, key],
    }));
    setImpact(null);
    setSaved(null);
  }

  function addProp() {
    const key = window.prompt('Nombre del atributo (sin espacios)')?.trim();
    if (!key) return;
    setSchema((prev) => ({ ...prev, properties: { ...prev.properties, [key]: { type: 'string' } } }));
    setImpact(null);
  }

  function removeProp(key: string) {
    setSchema((prev) => {
      const properties = { ...prev.properties };
      delete properties[key];
      return { ...prev, properties, required: prev.required.filter((k) => k !== key) };
    });
    setImpact(null);
  }

  const blocked = impact !== null && impact.invalid > 0;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 7, padding: 9, marginBottom: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 6 }}>
        <strong>{type.name}</strong>
        <code style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{type.code}</code>
      </div>

      <table className="r-table">
        <tbody>
          {Object.entries(schema.properties).map(([key, prop]) => (
            <tr key={key}>
              <td className="r-td" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {key}
              </td>
              <td className="r-td">
                <select
                  className="r-input"
                  style={{ height: 22, width: 92 }}
                  value={prop.type ?? 'string'}
                  onChange={(e) => setProp(key, { type: e.target.value as AttrPrimitive })}
                  aria-label={`Tipo de ${key}`}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td className="r-td">
                <input
                  className="r-input"
                  style={{ height: 22, width: 120 }}
                  value={prop.title ?? ''}
                  placeholder="Etiqueta"
                  onChange={(e) => setProp(key, { title: e.target.value })}
                  aria-label={`Etiqueta de ${key}`}
                />
              </td>
              <td className="r-td">
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={schema.required.includes(key)}
                    onChange={() => toggleRequired(key)}
                  />
                  obligatorio
                </label>
              </td>
              <td className="r-td">
                <button type="button" className="r-btn" data-variant="ghost" onClick={() => removeProp(key)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 6, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="r-btn" onClick={addProp}>
          + atributo
        </button>
        <button type="button" className="r-btn" onClick={() => void post(true)} disabled={busy}>
          Validar contra las unidades
        </button>
        <button
          type="button"
          className="r-btn"
          data-variant="primary"
          disabled={busy}
          onClick={() => {
            if (blocked && impact) {
              const ok = window.confirm(
                `${impact.invalid} de ${impact.total} unidades quedarían inválidas con este esquema. ¿Guardar igual?`,
              );
              if (!ok) return;
            }
            void post(false);
          }}
        >
          Guardar tipo
        </button>
        {saved && <span style={{ color: 'var(--ok)' }}>{saved}</span>}
      </div>

      {impact && (
        <div
          style={{
            marginTop: 7,
            padding: 7,
            borderRadius: 6,
            border: `1px solid ${impact.invalid > 0 ? 'var(--warn)' : 'var(--ok)'}`,
            fontSize: 11,
          }}
        >
          {impact.invalid === 0 ? (
            <span>Las {impact.total} unidades de este tipo siguen siendo válidas.</span>
          ) : (
            <>
              <strong style={{ color: 'var(--warn)' }}>
                {impact.invalid} de {impact.total} unidades quedarían inválidas.
              </strong>
              <ul style={{ marginTop: 4 }}>
                {impact.byIssue.map((issue) => (
                  <li key={`${issue.key}-${issue.message}`}>
                    <code>{issue.key}</code> {issue.message} — {issue.count} unidad(es)
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 4, color: 'var(--fg-muted)' }}>
                Ejemplos: {impact.samples.map((s) => s.code).join(', ')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
