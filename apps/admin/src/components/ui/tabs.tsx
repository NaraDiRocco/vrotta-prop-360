'use client';

/**
 * Tabs con `role="tablist"` real y flechas ←→ (patrón WAI-ARIA de tabs:
 * sólo la pestaña activa es Tab-able, las flechas mueven el foco entre
 * pestañas). Reemplaza los `r-btn` primario/ghost usados hoy como pestañas
 * en la sheet de unidad — ahí un botón azul relleno como "pestaña activa"
 * competía visualmente con el botón real de acción ("Guardar precio").
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  className?: string;
}

export function Tabs({ items, value, onChange, 'aria-label': ariaLabel, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + items.length) % items.length;
    const nextItem = items[nextIndex];
    if (!nextItem) return;
    onChange(nextItem.value);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className={['r-tabs', className].filter(Boolean).join(' ')}>
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={active}
            aria-controls={`tabpanel-${item.value}`}
            tabIndex={active ? 0 : -1}
            data-active={active}
            className="r-tabs__tab"
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Envuelve el contenido de una pestaña con el rol/id que `Tabs` espera para `aria-controls`. */
export function TabPanel({
  value,
  active,
  children,
}: {
  value: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${value}`} aria-labelledby={`tab-${value}`}>
      {children}
    </div>
  );
}
