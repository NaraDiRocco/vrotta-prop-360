'use client';

import { useMemo, useState } from 'react';
import { Header } from './Header.tsx';
import { ItemCard } from './ItemCard.tsx';
import { ProgressSummary } from './ProgressSummary.tsx';
import { computeProgress } from './progress.ts';
import type { MaterialItemState, MaterialProjectSummary, MaterialUploadedFile } from './types.ts';

/**
 * Orquesta la vista pública una vez que el token resolvió a un proyecto real.
 * Todo el estado vive acá en memoria — cuando exista la API de material, cada
 * handler pasa de mutar el `useState` local a hacer el POST correspondiente
 * (ver comentarios en cada handler) y este componente puede pasar a leer del
 * cache de React Query como el resto del panel.
 */
export function MaterialPublicView({
  token,
  proyecto,
  items,
}: {
  token: string;
  proyecto: MaterialProjectSummary;
  items: MaterialItemState[];
}) {
  const [state, setState] = useState(items);
  const progress = useMemo(() => computeProgress(state), [state]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byCategory = new Map<string, MaterialItemState[]>();
    for (const s of state) {
      if (!byCategory.has(s.item.categoria)) {
        byCategory.set(s.item.categoria, []);
        order.push(s.item.categoria);
      }
      byCategory.get(s.item.categoria)!.push(s);
    }
    // Dentro de cada categoría: obligatorios pendientes primero.
    for (const list of byCategory.values()) {
      list.sort((a, b) => rank(a) - rank(b));
    }
    return order.map((categoria) => ({ categoria, items: byCategory.get(categoria)! }));
  }, [state]);

  function update(itemId: string, patch: Partial<MaterialItemState>) {
    setState((prev) => prev.map((s) => (s.item.id === itemId ? { ...s, ...patch } : s)));
  }

  function handleFilesAdded(itemId: string, files: MaterialUploadedFile[]) {
    // TODO: el endpoint ya existe — POST /api/material/[token]/files?item=[itemId]
    // (multipart, uno por archivo, ver esa route) — pero este componente
    // todavía no lo llama: sigue mostrando el eco optimista de abajo en vez
    // de la respuesta real del servidor (id/filename/sizeBytes/createdAt).
    setState((prev) =>
      prev.map((s) =>
        s.item.id === itemId
          ? {
              ...s,
              archivos: [...s.archivos, ...files],
              estado: s.estado === 'aprobado' ? s.estado : 'recibido',
              marcadoSinMaterial: false,
            }
          : s,
      ),
    );
  }

  function handleMarkNoTengo(itemId: string, comentario: string) {
    // TODO: no existe todavía ni la RPC ni la route (a diferencia de la de
    // arriba, que ya tiene ambas) — seguir el mismo patrón que
    // /api/material/[token]/files: una route bajo
    // /api/material/[token]/items/[itemId], con su propia RPC
    // security-definer que revalide el token adentro, como
    // material_link_register_file.
    update(itemId, { estado: 'no_aplica', marcadoSinMaterial: true, comentario: comentario || null });
  }

  function handleUndoNoTengo(itemId: string) {
    const current = state.find((s) => s.item.id === itemId);
    const nextEstado = current && current.archivos.length > 0 ? 'recibido' : 'pendiente';
    update(itemId, { estado: nextEstado, marcadoSinMaterial: false });
  }

  function handleSaveComment(itemId: string, comentario: string) {
    // TODO: mismo caso que handleMarkNoTengo — falta la route y la RPC,
    // siguiendo el patrón de /api/material/[token]/files.
    update(itemId, { comentario: comentario || null });
  }

  return (
    <div className="mp">
      <div className="mp-shell">
        <Header proyecto={proyecto} />
        <ProgressSummary progress={progress} />

        {groups.map((group) => (
          <section className="mp-group" key={group.categoria} aria-label={group.categoria}>
            <h2 className="mp-group-title">{group.categoria}</h2>
            <div className="mp-list">
              {group.items.map((s) => (
                <ItemCard
                  key={s.item.id}
                  state={s}
                  defaultOpen={s.item.requisito === 'obligatorio' && s.estado === 'pendiente'}
                  onFilesAdded={handleFilesAdded}
                  onMarkNoTengo={handleMarkNoTengo}
                  onUndoNoTengo={handleUndoNoTengo}
                  onSaveComment={handleSaveComment}
                />
              ))}
            </div>
          </section>
        ))}

        <footer className="mp-footer">Enlace privado — válido solo para este proyecto.</footer>
      </div>
    </div>
  );
}

function rank(s: MaterialItemState): number {
  const resolved = s.estado === 'recibido' || s.estado === 'aprobado' || s.estado === 'no_aplica';
  if (resolved) return 2;
  return s.item.requisito === 'obligatorio' ? 0 : 1;
}
