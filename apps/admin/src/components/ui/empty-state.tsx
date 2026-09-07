/**
 * EmptyState único, reemplaza las siete variantes ad hoc de hoy (units-table,
 * leads ×2, material, scenes, publish ×3, team ×2, admin, projects,
 * sales-units, share-panel...). Criterio 0.1 del plan: "toda lista vacía
 * dice qué es, por qué está vacía y qué hacer (si el rol puede)" — por eso
 * `title`/`description` son obligatorios y `action` es explícitamente
 * opcional (el llamador decide si el rol puede resolverlo).
 *
 * `data-ui="empty-state"` es el gancho que usa QA (criterio g.15) para
 * verificar con un selector que el vacío es SIEMPRE este componente y no un
 * `<p>` suelto.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={['r-empty', className].filter(Boolean).join(' ')} data-ui="empty-state">
      <Icon size={32} aria-hidden focusable="false" className="r-empty__icon" />
      <p className="r-empty__title">{title}</p>
      {description && <p className="r-empty__desc">{description}</p>}
      {action && <div className="r-empty__action">{action}</div>}
    </div>
  );
}
