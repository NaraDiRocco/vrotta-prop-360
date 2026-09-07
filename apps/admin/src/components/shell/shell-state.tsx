'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export const SIDEBAR_STORAGE_KEY = 'r360.sidebar.collapsed';

/** Por debajo de acá el sidebar deja de ser una columna y pasa a ser cajón. */
const NARROW_QUERY = '(max-width: 899px)';

interface ShellState {
  collapsed: boolean;
  narrow: boolean;
  drawerOpen: boolean;
  toggleCollapsed: () => void;
  setDrawerOpen: (open: boolean) => void;
  /** Para devolver el foco al botón que abrió el cajón cuando se cierra. */
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}

const ShellCtx = createContext<ShellState | null>(null);

function useShell(): ShellState {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error('useShell fuera de <ShellProvider>');
  return ctx;
}

/**
 * Estado compartido entre el sidebar y el header.
 *
 * Vive acá y no dentro del sidebar porque el botón de colapsar está en el
 * header del contenido: es una decisión sobre el ancho de la pantalla, no
 * sobre la navegación, y dentro del sidebar desaparecería justo cuando el
 * sidebar se convierte en cajón.
 *
 * `collapsed` NO se usa para pintar el ancho (eso lo hace el CSS sobre
 * `html[data-sidebar]`, ver shell-styles.tsx): acá sólo existe para que el
 * botón pueda decir `aria-expanded` y para el atajo. Por eso se sincroniza
 * desde el DOM al montar, no desde localStorage.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [drawerOpen, setDrawerOpenState] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // El script inline ya dejó el atributo puesto antes del primer pintado.
  useEffect(() => {
    setCollapsed(document.documentElement.getAttribute('data-sidebar') === 'collapsed');
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const setDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpenState(open);
    document.documentElement.setAttribute('data-drawer', open ? 'open' : 'closed');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.documentElement.setAttribute('data-sidebar', next ? 'collapsed' : 'expanded');
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* navegador sin storage: vale para esta pestaña y listo */
      }
      return next;
    });
  }, []);

  // Navegar cierra el cajón: si no, se queda tapando la pantalla a la que
  // acabás de entrar.
  useEffect(() => {
    setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Atajo `[`. Se ignora mientras se escribe: en la búsqueda de unidades un
  // corchete es un corchete.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      event.preventDefault();
      if (window.matchMedia(NARROW_QUERY).matches) setDrawerOpenState((v) => {
        const next = !v;
        document.documentElement.setAttribute('data-drawer', next ? 'open' : 'closed');
        return next;
      });
      else toggleCollapsed();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const value = useMemo(
    () => ({ collapsed, narrow, drawerOpen, toggleCollapsed, setDrawerOpen, menuButtonRef }),
    [collapsed, narrow, drawerOpen, toggleCollapsed, setDrawerOpen],
  );

  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

/** Lo que necesita el sidebar: si está en modo cajón y si está abierto. */
export function useDrawer() {
  const { narrow, drawerOpen, setDrawerOpen, menuButtonRef } = useShell();
  return { narrow, drawerOpen, setDrawerOpen, menuButtonRef };
}

/**
 * Botón de colapsar, en el header. `aria-expanded` describe al sidebar, que
 * es lo que el botón controla; el estado real llega después de montar (el
 * ancho lo pinta el CSS), de ahí el `suppressHydrationWarning`.
 */
export function SidebarToggle() {
  const { collapsed, toggleCollapsed } = useShell();
  const label = collapsed ? 'Expandir la barra lateral' : 'Colapsar la barra lateral';
  return (
    <button
      type="button"
      className="shell-icon-btn shell-toggle"
      onClick={toggleCollapsed}
      aria-expanded={!collapsed}
      aria-controls="shell-sidebar"
      aria-label={label}
      title={`${label} ([)`}
      suppressHydrationWarning
    >
      {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden /> : <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}

/** Botón de menú, sólo por debajo de 900px (lo esconde el CSS más arriba). */
export function SidebarMenuButton() {
  const { drawerOpen, setDrawerOpen, menuButtonRef } = useShell();
  return (
    <button
      ref={menuButtonRef}
      type="button"
      className="shell-icon-btn shell-menu-btn"
      onClick={() => setDrawerOpen(!drawerOpen)}
      aria-expanded={drawerOpen}
      aria-controls="shell-sidebar"
      aria-label="Abrir la navegación"
      title="Abrir la navegación ([)"
    >
      <Menu size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** Fondo oscurecido del cajón. Cierra al tocarlo. */
export function SidebarBackdrop() {
  const { drawerOpen, setDrawerOpen } = useShell();
  return (
    <button
      type="button"
      className="shell-backdrop"
      tabIndex={-1}
      aria-hidden
      hidden={!drawerOpen}
      onClick={() => setDrawerOpen(false)}
    />
  );
}
