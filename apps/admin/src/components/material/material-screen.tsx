'use client';

/**
 * Pantalla de Material. Trabaja contra `./catalog.ts` + `./mock-state.ts`
 * porque `lib/material/**` y las rutas `/api/p/[project]/material/**`
 * todavía no existen (las construye otro agente en paralelo — ver el
 * comentario de conexión en `types.ts`). Toda la forma de los datos
 * (`MaterialItem`, `MaterialItemState`, `MaterialShareLink`) ya es el
 * contrato definitivo, así que el día que la API exista sólo hay que
 * reemplazar `useState`/las funciones `handle*` de acá abajo por
 * `useQuery`/`useMutation` apuntando a esas rutas — la UI no cambia.
 */
import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import type { ProjectKind } from '@/lib/data/types.ts';
import { catalogForKind } from './catalog.ts';
import { initialMaterialState, initialShareLinks } from './mock-state.ts';
import { ProgressHeader } from './progress-header.tsx';
import { FiltersBar, type MaterialFilters } from './filters-bar.tsx';
import { CategoryGroup } from './category-group.tsx';
import { SharePanel } from './share-panel.tsx';
import { isResolved, type MaterialFile, type MaterialItemState, type MaterialShareLink, type MaterialStatus } from './types.ts';

function randomToken(): string {
  return `mtr_${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2, 10)}`;
}

export function MaterialScreen({
  tenant,
  projectSlug,
  projectName,
  projectKind,
  initialStates,
  initialLinks,
}: {
  tenant: string;
  projectSlug: string;
  projectName: string;
  projectKind: ProjectKind;
  /** Estado real leído en el servidor. Sin esto la pantalla cae a los datos
   *  de ejemplo, que es como nació mientras la API no existía. */
  initialStates?: MaterialItemState[];
  initialLinks?: MaterialShareLink[];
}) {
  const catalog = useMemo(() => catalogForKind(projectKind), [projectKind]);

  const [itemStates, setItemStates] = useState<Map<string, MaterialItemState>>(
    () => new Map((initialStates ?? initialMaterialState()).map((s) => [s.itemId, s])),
  );
  const [links, setLinks] = useState<MaterialShareLink[]>(() => initialLinks ?? initialShareLinks());
  const [filters, setFilters] = useState<MaterialFilters>({ soloPendientes: false, soloObligatorios: false, categoria: null });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  const obligatorios = catalog.filter((i) => i.requisito === 'obligatorio');
  const obligatoriosResueltos = obligatorios.filter((i) => isResolved(itemStates.get(i.id)?.status ?? 'pendiente')).length;

  const categorias = useMemo(() => Array.from(new Set(catalog.map((i) => i.categoria))), [catalog]);

  const visibleItems = catalog.filter((item) => {
    if (filters.soloObligatorios && item.requisito !== 'obligatorio') return false;
    if (filters.categoria && item.categoria !== filters.categoria) return false;
    if (filters.soloPendientes) {
      const status = itemStates.get(item.id)?.status ?? 'pendiente';
      if (isResolved(status) || status === 'solicitado') return false;
    }
    return true;
  });

  const byCategory = new Map<string, typeof visibleItems>();
  for (const item of visibleItems) {
    const list = byCategory.get(item.categoria) ?? [];
    list.push(item);
    byCategory.set(item.categoria, list);
  }

  const statusByItem = new Map(Array.from(itemStates.values()).map((s) => [s.itemId, s.status]));
  const filesByItem = new Map(Array.from(itemStates.values()).map((s) => [s.itemId, s.files]));

  function patchState(itemId: string, patch: Partial<MaterialItemState>) {
    setItemStates((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId) ?? { itemId, status: 'pendiente' as MaterialStatus, files: [] };
      next.set(itemId, { ...current, ...patch });
      return next;
    });
  }

  function handleStatusChange(itemId: string, status: MaterialStatus) {
    patchState(itemId, { status });
  }

  function handleUpload(itemId: string, files: File[]) {
    const current = itemStates.get(itemId);
    const existing = current?.files ?? [];
    const newFiles: MaterialFile[] = files.map((f, idx) => ({
      id: `${itemId}-${Date.now()}-${idx}`,
      itemId,
      name: f.name,
      sizeBytes: f.size,
      uploadedAt: new Date().toISOString(),
      uploadedByEmail: 'naradirocco.97@gmail.com',
    }));
    const nextStatus: MaterialStatus = current && isResolved(current.status) ? current.status : 'recibido';
    patchState(itemId, { files: [...existing, ...newFiles], status: nextStatus });
  }

  function handleDeleteFile(itemId: string, fileId: string) {
    const current = itemStates.get(itemId);
    if (!current) return;
    patchState(itemId, { files: current.files.filter((f) => f.id !== fileId) });
  }

  function handleCreateLink() {
    setCreatingLink(true);
    // Simula latencia de red — reemplazar por POST /api/p/[project]/material/links.
    setTimeout(() => {
      setLinks((prev) => [
        { id: `link-${Date.now()}`, token: randomToken(), createdAt: new Date().toISOString(), createdByEmail: 'naradirocco.97@gmail.com', revoked: false },
        ...prev,
      ]);
      setCreatingLink(false);
    }, 200);
  }

  function handleRevokeLink(id: string) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
  }

  // Dominio público de ejemplo — el mismo patrón que usa el link de preview
  // en publish-screen.tsx. Cuando exista la ruta pública de subida de
  // material, ajustar acá.
  const shareBaseUrl = `https://${tenant}.recorrido360.app/${projectSlug}/material`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <ProgressHeader resolved={obligatoriosResueltos} total={obligatorios.length} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid var(--border)' }}>
          <button type="button" className="r-btn" data-variant="primary" onClick={() => setShareOpen(true)}>
            <Link2 size={13} strokeWidth={1.75} aria-hidden />
            Compartir con cliente
          </button>
        </div>
      </div>

      <FiltersBar filters={filters} onChange={setFilters} categorias={categorias} />

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {visibleItems.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>No hay ítems que coincidan con los filtros.</p>
        ) : (
          Array.from(byCategory.entries()).map(([categoria, items]) => (
            <CategoryGroup
              key={categoria}
              categoria={categoria}
              items={items}
              statusByItem={statusByItem}
              filesByItem={filesByItem}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
              onStatusChange={handleStatusChange}
              onUpload={handleUpload}
              onDelete={handleDeleteFile}
            />
          ))
        )}
      </div>

      {shareOpen && (
        <SharePanel
          projectName={projectName}
          shareBaseUrl={shareBaseUrl}
          links={links}
          onCreate={handleCreateLink}
          onRevoke={handleRevokeLink}
          onClose={() => setShareOpen(false)}
          creating={creatingLink}
        />
      )}
    </div>
  );
}
