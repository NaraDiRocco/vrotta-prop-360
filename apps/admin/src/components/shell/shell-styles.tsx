import { SIDEBAR_STORAGE_KEY } from './shell-state.tsx';

/**
 * CSS y bootstrap del shell, en un solo lugar.
 *
 * Va en un `<style>` inyectado y no en `globals.css` porque ese archivo tiene
 * un solo dueño por ola y en esta no es el sidebar (mismo motivo por el que la
 * card de proyectos inyecta su hover). Cuando se libere, este bloque se muda
 * tal cual: no hay un solo hex ni un solo px de tipografía acá, todo sale de
 * los tokens.
 *
 * Toda la mecánica de colapsado es CSS sobre `html[data-sidebar]`, no React.
 * El motivo es concreto: la preferencia vive en `localStorage` y el servidor
 * no la conoce, así que cualquier versión con estado de React pintaría el
 * sidebar ancho y lo encogería al hidratar — el mismo parpadeo que el tema y
 * la densidad ya evitan con un script inline. Acá se hace igual, y como
 * consecuencia las etiquetas nunca salen del DOM (siguen existiendo para un
 * lector de pantalla, sólo cambian de tamaño y de posición).
 */

/**
 * Colapsado por defecto por debajo de 1200px, porque a ese ancho el sidebar
 * expandido se come el 20% de la pantalla y lo que importa es la tabla. La
 * preferencia explícita ('1'/'0') gana siempre: si alguien lo abrió a mano en
 * una notebook chica, no se lo volvemos a cerrar.
 */
const SIDEBAR_BOOTSTRAP = `try{var v=localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)});var c=v==="1"?1:v==="0"?0:(window.innerWidth<1200?1:0);document.documentElement.setAttribute("data-sidebar",c?"collapsed":"expanded")}catch(e){document.documentElement.setAttribute("data-sidebar","expanded")}`;

const CSS = `
.shell-root { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
.shell-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }

/* ── sidebar ─────────────────────────────────────────────────────────── */

.shell-side {
  width: var(--spacing-sidebar);
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-subtle);
  border-right: 1px solid var(--border);
  transition: width 120ms ease;
}
.shell-side-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px; display: flex; flex-direction: column; gap: 2px; }
.shell-side-scroll ul { list-style: none; display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; }
.shell-side-head, .shell-side-foot { flex: none; padding: 4px; }
.shell-sep { height: 1px; background: var(--border); flex: none; }

/* Un ítem de navegación: icono + etiqueta. La altura sale de --control-h para
   que la densidad cómoda le dé el blanco de click de 40px sin tocar el TSX. */
.shell-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: calc(var(--control-h) + 8px);
  padding: 0 8px;
  border-radius: var(--radius-control);
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-decoration: none;
}
.shell-item:hover { background: var(--bg-hover); color: var(--fg); }
.shell-item[aria-current="page"] { background: var(--bg-sel); color: var(--accent); font-weight: 600; }
.shell-icon { width: 18px; flex: none; display: grid; place-items: center; }
.shell-item-label { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

/* Los ítems del proyecto cuelgan del encabezado del grupo. */
.shell-sub { margin-left: 12px; }
.shell-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 2px;
  min-width: 0;
}
.shell-group-kicker { font-size: var(--text-xs); color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; }

/* ── colapsado (sólo en pantallas anchas: abajo de 900 el sidebar es cajón
      y ahí siempre se ve entero) ─────────────────────────────────────── */

@media (min-width: 900px) {
  :root[data-sidebar="collapsed"] .shell-side { width: var(--spacing-sidebar-collapsed); }
  :root[data-sidebar="collapsed"] .shell-hide-collapsed { display: none; }
  :root[data-sidebar="collapsed"] .shell-item {
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    height: 46px;
    padding: 0 2px;
    font-size: var(--text-xs);
    line-height: 1;
  }
  /* El indent de 12px no se lee a 64px de ancho: pasa a ser una línea. */
  :root[data-sidebar="collapsed"] .shell-sub {
    margin-left: 6px;
    border-left: 2px solid var(--border-strong);
    border-radius: 0 var(--radius-control) var(--radius-control) 0;
  }
  :root[data-sidebar="collapsed"] .shell-group-head { justify-content: center; padding: 8px 2px 2px; }
}

/* ── cajón lateral por debajo de 900 ─────────────────────────────────── */

/* .shell-icon-btn se define más abajo con la misma especificidad, así que
   estas dos van con doble clase: si no, el botón de menú se vería siempre. */
.shell-backdrop { display: none; }
.shell-icon-btn.shell-menu-btn { display: none; }

@media (max-width: 899px) {
  .shell-side {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    width: var(--spacing-sidebar);
    transform: translateX(-100%);
    box-shadow: var(--shadow-overlay);
  }
  :root[data-drawer="open"] .shell-side { transform: translateX(0); }
  .shell-backdrop { position: fixed; inset: 0; z-index: 59; background: var(--overlay-backdrop); border: 0; }
  :root[data-drawer="open"] .shell-backdrop { display: block; }
  .shell-icon-btn.shell-menu-btn { display: grid; }
  .shell-icon-btn.shell-toggle { display: none; }
  /* El breadcrumb no se parte en dos líneas: se recorta y el cliente y el
     proyecto siguen visibles a la izquierda. */
  .shell-crumbs { flex-wrap: nowrap; overflow: hidden; }
  .shell-crumb-type { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .shell-side { transition: none; }
}

/* ── header ──────────────────────────────────────────────────────────── */

.shell-header {
  flex: none;
  height: calc(var(--control-h) + 14px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.shell-crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
.shell-crumb { display: flex; align-items: center; gap: 6px; min-width: 0; }
.shell-crumb-type { font-size: var(--text-xs); color: var(--fg-muted); }
.shell-icon-btn {
  flex: none;
  width: var(--control-h);
  height: var(--control-h);
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
}
.shell-icon-btn:hover { background: var(--bg-hover); color: var(--fg); }

/* ── popovers (cliente, proyecto, persona) ───────────────────────────── */

.shell-pop-host { position: relative; }
.shell-pop {
  position: absolute;
  z-index: 40;
  min-width: 240px;
  max-height: min(70vh, 480px);
  overflow-y: auto;
  padding: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-overlay);
}
.shell-pop-head { padding: 6px 8px; font-size: var(--text-xs); color: var(--fg-muted); }
.shell-menuitem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: calc(var(--control-h) + 2px);
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--fg);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.shell-menuitem:hover { background: var(--bg-hover); }
.shell-menuitem[aria-checked="true"],
.shell-menuitem[data-active="true"] { background: var(--bg-sel); color: var(--accent); font-weight: 600; }
.shell-menu-sep { height: 1px; background: var(--border); margin: 4px 0; }

/* Botón de cabecera/pie del sidebar: ocupa todo el ancho y se comporta como
   una fila, no como un botón suelto. */
.shell-row-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.shell-row-btn:hover { background: var(--bg-hover); }
.shell-avatar {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 700;
  font-size: var(--text-sm);
}
.shell-avatar-person { background: var(--bg-sunken); color: var(--fg-muted); }
/* Distintivo de plataforma sobre el avatar del cliente: reemplaza a la banda
   azul de 22px que antes repetía "Operando como Vrotta" en cada pantalla. */
.shell-avatar-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--bg);
  color: var(--accent);
  border: 1px solid var(--border);
}
.shell-row-main { min-width: 0; flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); }
.shell-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
/* El rol iba en 9px --fg-faint (2.6:1). Ahora es --fg-muted a --text-sm. */
.shell-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); color: var(--fg-muted); }
`;

/** Estilos + bootstrap sin parpadeo. Se monta una sola vez, en `AppShell`. */
export function ShellStyles() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOTSTRAP }} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </>
  );
}
