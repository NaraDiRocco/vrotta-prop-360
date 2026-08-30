'use client';

import { useCallback, useRef, useState } from 'react';
import type { SceneKind } from '@r360/core';
import { readImageDimensions, validateSceneUpload } from '@/lib/scenes/upload-validation.ts';
import type { UploadValidationIssue } from '@/lib/data/types.ts';

const KIND_LABEL: Record<SceneKind, string> = {
  panorama: 'Panorama (equirectangular 2:1)',
  floorplan: 'Plano',
  map: 'Mapa',
  video: 'Video',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || `escena-${Date.now()}`;
}

export interface AcceptedUpload {
  slug: string;
  kind: SceneKind;
  name: string;
  source: Record<string, unknown>;
}

/**
 * Zona de subida. La validación corre ANTES de que exista cualquier request:
 * `validateSceneUpload` es pura y `readImageDimensions` es lo único que toca
 * el navegador (decodifica el archivo localmente, nunca lo manda a nadie
 * para "ver si sirve"). Si falla, el motivo concreto queda en pantalla y no
 * se dispara ni una petición.
 */
export function UploadZone({ onAccepted, disabled }: { onAccepted: (upload: AcceptedUpload) => void; disabled?: boolean }) {
  const [kind, setKind] = useState<SceneKind>('panorama');
  const [dragOver, setDragOver] = useState(false);
  const [rejections, setRejections] = useState<{ file: string; issues: UploadValidationIssue[] }[]>([]);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setChecking(true);
      const newRejections: { file: string; issues: UploadValidationIssue[] }[] = [];
      for (const file of Array.from(files)) {
        const dimensions = kind === 'video' ? undefined : (await readImageDimensions(file)) ?? undefined;
        const result = validateSceneUpload({
          kind,
          file: { name: file.name, size: file.size, type: file.type },
          dimensions,
        });
        if (!result.ok) {
          newRejections.push({ file: file.name, issues: result.issues });
          continue;
        }
        onAccepted({
          slug: slugify(file.name.replace(/\.[^.]+$/, '')),
          kind,
          name: file.name.replace(/\.[^.]+$/, ''),
          source: dimensions
            ? kind === 'panorama'
              ? { faceSize: 2048, tileSize: 512, levels: 4, format: 'webp', width: dimensions.width, height: dimensions.height }
              : { url: '', width: dimensions.width, height: dimensions.height }
            : {},
        });
      }
      setRejections(newRejections);
      setChecking(false);
      if (inputRef.current) inputRef.current.value = '';
    },
    [kind, onAccepted],
  );

  return (
    <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Tipo:</span>
        {(Object.keys(KIND_LABEL) as SceneKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className="r-chip"
            data-on={kind === k}
            onClick={() => setKind(k)}
            disabled={disabled}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`,
          borderRadius: 8,
          padding: '16px 12px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: dragOver ? 'var(--bg-sel)' : 'var(--bg-subtle)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={kind === 'video' ? 'video/*' : 'image/*'}
          hidden
          disabled={disabled}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {checking ? 'Verificando…' : `Arrastrá archivos acá o hacé click para elegir — ${KIND_LABEL[kind]}`}
        </div>
        {kind === 'panorama' && (
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
            Relación 2:1 exacta, mínimo 4096px de ancho.
          </div>
        )}
      </div>

      {rejections.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rejections.map((r) => (
            <div
              key={r.file}
              style={{
                fontSize: 11,
                color: 'var(--danger)',
                background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                borderRadius: 5,
                padding: '6px 8px',
              }}
            >
              <strong>{r.file}</strong> rechazado: {r.issues.map((i) => i.message).join(' · ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
