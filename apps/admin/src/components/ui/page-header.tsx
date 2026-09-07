/**
 * PageHeader: título + descripción + acciones a la derecha. Reemplaza el
 * "cada página a su manera" de hoy (`/admin`, `/admin/team`, `team-screen`,
 * altas de proyecto/cliente ya tienen cada una su propio `<h1>` con `style`
 * suelto). Alineado con el breadcrumb del shell (mismo `--text-lg`).
 */
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={['r-page-header', className].filter(Boolean).join(' ')}>
      <div className="r-page-header__text">
        <h1 className="r-page-header__title">{title}</h1>
        {description && <p className="r-page-header__desc">{description}</p>}
      </div>
      {actions && <div className="r-page-header__actions">{actions}</div>}
    </header>
  );
}
