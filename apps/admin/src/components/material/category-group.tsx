import { ItemRow } from './item-row.tsx';
import type { MaterialFile, MaterialItem, MaterialStatus } from './types.ts';

export function CategoryGroup({
  categoria,
  items,
  statusByItem,
  filesByItem,
  expandedId,
  onToggle,
  onStatusChange,
  onUpload,
  onDelete,
  disabled,
}: {
  categoria: string;
  items: MaterialItem[];
  statusByItem: Map<string, MaterialStatus>;
  filesByItem: Map<string, MaterialFile[]>;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onStatusChange: (id: string, next: MaterialStatus) => void;
  onUpload: (id: string, files: File[]) => void;
  onDelete: (id: string, fileId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }} className="r-surface">
      <div
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--fg-muted)',
          background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border)',
          borderTopLeftRadius: 'var(--radius-card)',
          borderTopRightRadius: 'var(--radius-card)',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        {categoria}
      </div>
      <div>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            status={statusByItem.get(item.id) ?? 'pendiente'}
            files={filesByItem.get(item.id) ?? []}
            expanded={expandedId === item.id}
            onToggle={() => onToggle(item.id)}
            onStatusChange={(next) => onStatusChange(item.id, next)}
            onUpload={(files) => onUpload(item.id, files)}
            onDelete={(fileId) => onDelete(item.id, fileId)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
