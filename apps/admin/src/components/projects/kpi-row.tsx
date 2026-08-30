/**
 * Fila de KPIs del cliente — lo primero que responde "¿cómo venimos?".
 *
 * Agrega sobre todos los proyectos del tenant. Los tres KPIs de negocio
 * (disponibles/reservadas/vendidas) usan el vocabulario de estados
 * comerciales (punto + label vía `--st-*`), nunca `--ui-*`: son cifras del
 * negocio, no del sistema. Ver plan §1.3 y §4.1.
 *
 * Ninguno es link por ahora: no existe todavía una vista de unidades
 * cross-proyecto a la que apuntar, y el plan pide no inventar navegación
 * en esta etapa — con que sean cifras ya paga.
 */
import { StatusDot } from '@/components/status.tsx';
import type { ProjectCard } from '@/lib/data/types.ts';

export function ClientKpiRow({ projects, leads7d }: { projects: ProjectCard[]; leads7d: number }) {
  const unitsTotal = projects.reduce((acc, p) => acc + p.unitsTotal, 0);
  const disponibles = projects.reduce((acc, p) => acc + p.statusCounts.disponible, 0);
  const reservadas = projects.reduce((acc, p) => acc + p.statusCounts.reservado, 0);
  const vendidas = projects.reduce((acc, p) => acc + p.statusCounts.vendido, 0);

  return (
    <section
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 28,
        padding: '14px 18px',
        marginBottom: 16,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
      }}
      aria-label="Indicadores del cliente"
    >
      <Kpi label="unidades" value={unitsTotal} />
      <Kpi label="disponibles" value={disponibles} dot="disponible" />
      <Kpi label="reservadas" value={reservadas} dot="reservado" />
      <Kpi label="vendidas" value={vendidas} dot="vendido" />
      <Kpi label="leads 7 días" value={leads7d} />
    </section>
  );
}

function Kpi({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot?: 'disponible' | 'reservado' | 'vendido';
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 72 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {dot && <StatusDot status={dot} size={9} />}
        <span className="tnum" style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, lineHeight: 1 }}>
          {value}
        </span>
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{label}</span>
    </div>
  );
}
