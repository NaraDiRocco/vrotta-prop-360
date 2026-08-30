'use client';

import { useCallback, useRef, useState } from 'react';
import { Trash2, UploadCloud } from 'lucide-react';
import { formatBytes, formatDateTime } from './format.ts';
import type { MaterialFile, MaterialItem } from './types.ts';

/**
 * Subida de archivos por ítem: arrastrar y soltar + input oculto. Punto de
 * conexión futuro: `onUpload` hoy agrega el archivo al estado local del
 * screen; cuando exista `POST /api/p/[project]/material/[itemId]/files`
 * pasa a subir de verdad y `onUpload` queda igual de firma (recibe File[]).
 */
export function ItemFiles({
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
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onUpload(Array.from(list));
      if (inputRef.current) inputRef.current.value = '';
    },
    [onUpload],
  );

  if (!item.aceptaArchivos) {
    return <p style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Este ítem no recibe archivos — se resuelve por texto o coordinación directa.</p>;
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`,
          borderRadius: 6,
          padding: '8px 10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: dragOver ? 'var(--bg-sel)' : 'var(--bg-subtle)',
          opacity: disabled ? 0.5 : 1,
          marginBottom: files.length > 0 ? 8 : 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={item.extensiones?.join(',')}
          hidden
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <UploadCloud size={14} strokeWidth={1.75} color="var(--fg-muted)" aria-hidden />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          Arrastrá archivos acá o hacé click para elegir{item.extensiones ? ` — ${item.extensiones.join(', ')}` : ''}
        </span>
      </div>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                padding: '4px 8px',
                border: '1px solid var(--border)',
                borderRadius: 5,
                background: 'var(--bg)',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                {f.name}
              </span>
              <span className="tnum" style={{ color: 'var(--fg-muted)', flex: 'none' }}>
                {formatBytes(f.sizeBytes)}
              </span>
              <span style={{ color: 'var(--fg-faint)', flex: 'none' }}>{formatDateTime(f.uploadedAt)}</span>
              <span style={{ color: 'var(--fg-faint)', flex: 'none' }} title={f.uploadedByEmail}>
                {f.uploadedByEmail.split('@')[0]}
              </span>
              <button
                type="button"
                className="r-btn"
                data-variant="ghost"
                disabled={disabled}
                onClick={() => onDelete(f.id)}
                title="Borrar archivo"
                style={{ width: 22, height: 22, padding: 0, justifyContent: 'center', flex: 'none' }}
              >
                <Trash2 size={12} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
