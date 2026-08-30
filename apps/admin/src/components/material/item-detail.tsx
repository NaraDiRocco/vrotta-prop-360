import type { MaterialFile, MaterialItem } from './types.ts';
import { ItemFiles } from './item-files.tsx';

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

/** Ficha completa de un ítem: se muestra al expandir la fila. */
export function ItemDetail({
  item,
  files,
  onUpload,
  onDelete,
  disabled,
}: {
  item: MaterialItem;
  files: MaterialFile[];
  onUpload: (files: File[]) => void;
  onDelete: (fileId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 14px 14px 40px',
        background: 'var(--bg-subtle)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <Field label="Qué es" value={item.queEs} />
        <Field label="Para qué lo usamos" value={item.paraQue} />
        <Field label="Formato" value={item.formato} />
        <Field label="Quién lo hace" value={item.quienLoHace} />
        <Field label="Cómo se hace" value={item.comoSeHace} />
        <Field label="Dónde contratarlo" value={item.dondeContratarlo} />
        <Field label="Precio de referencia" value={item.precioReferencia} />
      </div>

      <div
        style={{
          padding: '8px 10px',
          borderRadius: 6,
          background: 'var(--ui-warn-bg)',
          border: '1px solid var(--ui-warn-border)',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ui-warn)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>
          Si no lo tienen
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>{item.siNoLoTienen}</div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
          Archivos
        </div>
        <ItemFiles item={item} files={files} onUpload={onUpload} onDelete={onDelete} disabled={disabled} />
      </div>
    </div>
  );
}
