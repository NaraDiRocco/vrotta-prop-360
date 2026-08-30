export interface MaterialFilters {
  soloPendientes: boolean;
  soloObligatorios: boolean;
  categoria: string | null;
}

export function FiltersBar({
  filters,
  onChange,
  categorias,
}: {
  filters: MaterialFilters;
  onChange: (next: MaterialFilters) => void;
  categorias: string[];
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border)', flex: 'none', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="r-chip"
        data-on={filters.soloPendientes}
        onClick={() => onChange({ ...filters, soloPendientes: !filters.soloPendientes })}
      >
        Solo pendientes
      </button>
      <button
        type="button"
        className="r-chip"
        data-on={filters.soloObligatorios}
        onClick={() => onChange({ ...filters, soloObligatorios: !filters.soloObligatorios })}
      >
        Solo obligatorios
      </button>
      <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
      <select
        className="r-input"
        style={{ width: 160, height: 24, fontSize: 11 }}
        value={filters.categoria ?? ''}
        onChange={(e) => onChange({ ...filters, categoria: e.target.value || null })}
      >
        <option value="">Todas las categorías</option>
        {categorias.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
