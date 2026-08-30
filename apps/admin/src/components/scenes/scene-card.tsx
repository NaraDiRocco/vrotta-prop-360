'use client';

import { useState } from 'react';
import type { SceneKind } from '@r360/core';
import type { JobRow, SceneRow } from '@/lib/data/types.ts';

const KIND_LABEL: Record<SceneKind, string> = {
  panorama: 'Panorama',
  floorplan: 'Plano',
  map: 'Mapa',
  video: 'Video',
};

const KIND_GLYPH: Record<SceneKind, string> = {
  panorama: '◐',
  floorplan: '▦',
  map: '🗺',
  video: '▶',
};

export function SceneCard({
  scene,
  job,
  editHref,
  onSetInitial,
  onRename,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
}: {
  scene: SceneRow;
  job?: JobRow;
  editHref: string;
  onSetInitial: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  dragging: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scene.name);

  const processing = job && (job.status === 'queued' || job.status === 'running');
  const failed = job?.status === 'failed';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg)',
        opacity: dragging ? 0.4 : 1,
        cursor: draggable ? 'grab' : undefined,
      }}
    >
      <div
        style={{
          height: 110,
          background: 'var(--bg-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          color: 'var(--fg-faint)',
          position: 'relative',
        }}
      >
        {KIND_GLYPH[scene.kind]}
        {scene.isInitial && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            INICIAL
          </span>
        )}
        {processing && (
          <span
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--accent)',
            }}
          >
            Procesando {Math.round(job.progress)}%
          </span>
        )}
        {failed && (
          <span
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--bg)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
            }}
          >
            Falló
          </span>
        )}
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {editing ? (
          <input
            className="r-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== scene.name) onRename(name.trim());
              else setName(scene.name);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setName(scene.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Renombrar"
            style={{
              textAlign: 'left',
              fontWeight: 600,
              fontSize: 13,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'text',
              color: 'var(--fg)',
            }}
          >
            {scene.name}
          </button>
        )}

        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--fg-muted)' }}>
          <span>{KIND_LABEL[scene.kind]}</span>
          <span>·</span>
          <span>{scene.hotspotCount} hotspot{scene.hotspotCount === 1 ? '' : 's'}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
          <a href={editHref} className="r-btn" data-variant="primary" style={{ fontSize: 11, height: 24, padding: '0 8px' }}>
            Editar
          </a>
          {!scene.isInitial && (
            <button type="button" className="r-btn" style={{ fontSize: 11, height: 24, padding: '0 8px' }} onClick={onSetInitial}>
              Marcar inicial
            </button>
          )}
          <button
            type="button"
            className="r-btn"
            data-variant="ghost"
            style={{ fontSize: 11, height: 24, padding: '0 8px', color: 'var(--danger)', marginLeft: 'auto' }}
            onClick={() => {
              if (confirm(`¿Eliminar la escena "${scene.name}"? Esto no se puede deshacer.`)) onDelete();
            }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
