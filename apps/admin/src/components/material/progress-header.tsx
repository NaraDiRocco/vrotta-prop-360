/** "8 de 14 obligatorios recibidos" — lo primero que se ve, para saber de un golpe qué bloquea. */
export function ProgressHeader({ resolved, total }: { resolved: number; total: number }) {
  const pct = total === 0 ? 1 : resolved / total;
  const blocked = total - resolved;
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {resolved} de {total} obligatorios recibidos
        </span>
        {blocked > 0 ? (
          <span style={{ fontSize: 11, color: 'var(--ui-danger)', fontWeight: 500 }}>{blocked} bloqueante(s)</span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--ui-ok)', fontWeight: 500 }}>completo</span>
        )}
      </div>
      <div className="r-stack" style={{ width: '100%' }}>
        <div
          style={{
            width: `${Math.round(pct * 100)}%`,
            background: blocked > 0 ? 'var(--ui-warn)' : 'var(--ui-ok)',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
    </div>
  );
}
