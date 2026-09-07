import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Banner de error/aviso arriba del formulario (nunca un `<p style={{color:
 * 'var(--danger)'}}>` suelto como hoy). `action` es el link "¿La olvidaste?
 * Recuperala" que hoy no existe en ningún error de estas pantallas.
 */
const TONE_ICON: Record<'danger' | 'warn' | 'info' | 'ok', LucideIcon> = {
  danger: AlertCircle,
  warn: AlertTriangle,
  info: Info,
  ok: CheckCircle2,
};

export function AuthBanner({
  tone = 'danger',
  children,
  action,
}: {
  tone?: 'danger' | 'warn' | 'info' | 'ok';
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div className="r-banner auth-banner" data-tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={16} aria-hidden focusable="false" />
      <div className="auth-banner-body">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}
