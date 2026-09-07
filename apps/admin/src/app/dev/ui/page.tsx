import { notFound } from 'next/navigation';
import { isMockMode } from '@/lib/data/repo.ts';
import { DevUiShowcase } from './dev-ui-showcase.tsx';

/**
 * `/dev/ui` — catálogo interno de las primitivas de `src/components/ui/`
 * (Ola 1.A del plan de diseño). No es producto: es la página que usa QA
 * para mirar cada componente en sus variantes, en claro/oscuro y en
 * compacta/cómoda (los dos toggles de acá arriba cambian `data-theme`/
 * `data-density` en `<html>`, igual que hace el menú de usuario real), y la
 * que uso yo para mirar lo que construyo sin tener que migrar una pantalla
 * real todavía (eso es la Ola 2).
 *
 * Sólo existe en modo demo: en producción esta ruta no debe filtrar el
 * inventario de componentes internos ni quedar indexable, así que devuelve
 * 404 apenas `NEXT_PUBLIC_R360_MOCK=0`.
 */
export default function DevUiPage() {
  if (!isMockMode()) notFound();
  return <DevUiShowcase />;
}
