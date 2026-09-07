/**
 * Skeleton sin shimmer (regla §7.2 del plan: nada que llame la atención de
 * más que el propio contenido cuando llegue). Hoy sólo existe en
 * `units-table`; el resto de la app usa "en blanco hasta que llega la
 * query", que es exactamente el estado que el criterio 0.2 prohíbe.
 *
 * Tres formas, todas leyendo tokens de densidad, nunca un número propio:
 * `Skeleton` es el bloque de base; `SkeletonRows` imita filas de tabla
 * (`var(--row-h)`, para no saltar de alto cuando llegan los datos reales);
 * `SkeletonCard` imita el placeholder 16:9 de una card de proyecto/escena.
 */
import type { CSSProperties, HTMLAttributes } from 'react';

export function Skeleton({ className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['r-skeleton', className].filter(Boolean).join(' ')} style={style} {...rest} />
  );
}

export interface SkeletonRowsProps {
  /** Cantidad de filas fantasma a dibujar. */
  count?: number;
  /** Etiqueta para el único `role="status"` del grupo (no uno por fila). */
  label?: string;
  style?: CSSProperties;
}

export function SkeletonRows({ count = 5, label = 'Cargando', style }: SkeletonRowsProps) {
  return (
    <div role="status" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 1, ...style }}>
      {Array.from({ length: count }, (_, index) => (
        // Cada fila fantasma es decorativa: el único anuncio a un lector de
        // pantalla es el `role="status"` del contenedor, arriba.
        <Skeleton key={index} aria-hidden style={{ height: 'var(--row-h)' }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ label = 'Cargando', style }: { label?: string; style?: CSSProperties }) {
  return (
    <Skeleton
      role="status"
      aria-label={label}
      style={{ aspectRatio: '16 / 9', width: '100%', ...style }}
    />
  );
}
