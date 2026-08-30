import { CheckCircle2 } from 'lucide-react';
import type { MaterialProgress } from './progress.ts';

export function ProgressSummary({ progress }: { progress: MaterialProgress }) {
  const pct = Math.round(progress.ratio * 100);
  return (
    <section className="mp-progress" aria-label="Progreso del material">
      <div className="mp-progress-row">
        <span className="mp-progress-label">Progreso</span>
        <span className="mp-progress-count">
          {progress.resueltos} de {progress.total} listos
        </span>
      </div>
      <div className="mp-progress-track">
        <div
          className="mp-progress-fill"
          data-done={progress.listoParaArrancar}
          style={{ width: `${pct}%` }}
        />
      </div>

      {progress.listoParaArrancar ? (
        <p className="mp-progress-done">
          <CheckCircle2 size={20} aria-hidden />
          Ya tenemos todo lo obligatorio. ¡Gracias! El resto es opcional.
        </p>
      ) : (
        <ul className="mp-progress-blockers">
          <li>
            Falta{progress.obligatoriosPendientes.length === 1 ? '' : 'n'} {progress.obligatoriosPendientes.length}{' '}
            {progress.obligatoriosPendientes.length === 1 ? 'ítem obligatorio' : 'ítems obligatorios'} para poder
            arrancar la producción:
          </li>
          {progress.obligatoriosPendientes.map((s) => (
            <li key={s.item.id}>
              <a href={`#item-${s.item.id}`}>{s.item.nombre}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
