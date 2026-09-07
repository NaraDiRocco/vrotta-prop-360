/**
 * Banner/Callout con tono, reemplaza los tres banners distintos de hoy (la
 * cola de atención con header teñido, los avisos de publicar con
 * `color-mix(var(--warn) 10%)` inline, y "Vrotta está trabajando en esto"
 * con sólo borde). El tono usa siempre el par `--ui-*-bg/-border` + color de
 * texto, nunca un mix ad hoc en el TSX que consume esto.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type BannerTone = 'info' | 'warn' | 'danger' | 'ok';

const TONE_ICON: Record<BannerTone, LucideIcon> = {
  info: Info,
  warn: AlertTriangle,
  danger: AlertCircle,
  ok: CheckCircle2,
};

export interface BannerProps {
  tone?: BannerTone;
  /** Ícono propio, si el default del tono no aplica (p. ej. "Vrotta está trabajando" con un ícono neutro). */
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ tone = 'info', icon, children, action, className }: BannerProps) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <div
      className={['r-banner', className].filter(Boolean).join(' ')}
      data-tone={tone}
      // Un error de guardado interrumpe la tarea: se anuncia solo. Info/ok/
      // warn son avisos que están ahí, no un evento — no compiten por
      // atención con lo que la persona esté leyendo.
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <Icon size={16} aria-hidden focusable="false" className="r-banner__icon" />
      <div className="r-banner__body">{children}</div>
      {action && <div className="r-banner__action">{action}</div>}
    </div>
  );
}
