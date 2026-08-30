import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { RequirementChip } from './requirement-chip.tsx';
import { StatusSelect } from './status-select.tsx';
import { ItemDetail } from './item-detail.tsx';
import type { MaterialFile, MaterialItem, MaterialStatus } from './types.ts';

export function ItemRow({
  item,
  status,
  files,
  expanded,
  onToggle,
  onStatusChange,
  onUpload,
  onDelete,
  disabled,
}: {
  item: MaterialItem;
  status: MaterialStatus;
  files: MaterialFile[];
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (next: MaterialStatus) => void;
  onUpload: (files: File[]) => void;
  onDelete: (fileId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div
        className="r-row"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          padding: '0 10px 0 14px',
          borderBottom: expanded ? 'none' : '1px solid var(--border)',
          cursor: 'pointer',
        }}
      >
        <span style={{ width: 14, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--fg-faint)' }}>
          {expanded ? <ChevronDown size={13} strokeWidth={2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2} aria-hidden />}
        </span>

        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
          {item.nombre}
        </span>

        {files.length > 0 && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--fg-muted)', flex: 'none' }}
            title={`${files.length} archivo(s)`}
          >
            <Paperclip size={11} strokeWidth={1.75} aria-hidden />
            {files.length}
          </span>
        )}

        <RequirementChip requisito={item.requisito} />

        <StatusSelect value={status} onChange={onStatusChange} disabled={disabled} />
      </div>

      {expanded && (
        <ItemDetail item={item} files={files} onUpload={onUpload} onDelete={onDelete} disabled={disabled} />
      )}
    </div>
  );
}
