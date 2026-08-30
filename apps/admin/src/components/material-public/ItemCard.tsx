'use client';

import { useId, useRef, useState, type DragEvent } from 'react';
import { Check, ChevronDown, HelpCircle, MinusCircle, Paperclip, Undo2, X } from 'lucide-react';
import type { MaterialItemState, MaterialUploadedFile } from './types.ts';
import { fmtMB, validateMaterialUpload } from './upload-validation.ts';

const REQUISITO_LABEL: Record<MaterialItemState['item']['requisito'], string> = {
  obligatorio: 'Obligatorio',
  recomendado: 'Recomendado',
  opcional: 'Opcional',
};

function statusLabel(state: MaterialItemState): string {
  if (state.marcadoSinMaterial) return 'Marcado como "no lo tengo"';
  switch (state.estado) {
    case 'aprobado':
      return 'Recibido y aprobado';
    case 'recibido':
      return 'Recibido, en revisión';
    case 'solicitado':
      return 'Te lo pedimos — todavía no llegó';
    case 'no_aplica':
      return 'No aplica a este proyecto';
    case 'pendiente':
    default:
      return 'Todavía falta';
  }
}

interface PendingUpload {
  key: string;
  file: File;
  progress: number;
  error: string | null;
  done: boolean;
}

interface ItemCardProps {
  state: MaterialItemState;
  defaultOpen?: boolean;
  onFilesAdded: (itemId: string, files: MaterialUploadedFile[]) => void;
  onMarkNoTengo: (itemId: string, comentario: string) => void;
  onUndoNoTengo: (itemId: string) => void;
  onSaveComment: (itemId: string, comentario: string) => void;
}

export function ItemCard({
  state,
  defaultOpen = false,
  onFilesAdded,
  onMarkNoTengo,
  onUndoNoTengo,
  onSaveComment,
}: ItemCardProps) {
  const { item } = state;
  const [open, setOpen] = useState(defaultOpen);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [showNoTengoForm, setShowNoTengoForm] = useState(false);
  const [noTengoText, setNoTengoText] = useState('');
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentText, setCommentText] = useState(state.comentario ?? '');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const resolved = state.estado === 'recibido' || state.estado === 'aprobado' || state.estado === 'no_aplica';

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const uploads: PendingUpload[] = files.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      error: null,
      done: false,
    }));
    setPending((prev) => [...prev, ...uploads]);

    for (const upload of uploads) {
      const validation = validateMaterialUpload(item, upload.file);
      if (!validation.ok) {
        setPending((prev) =>
          prev.map((p) => (p.key === upload.key ? { ...p, error: validation.issues[0]?.message ?? 'Archivo inválido.' } : p)),
        );
        continue;
      }
      simulateUpload(upload.key, upload.file);
    }
  }

  /**
   * Simulación de subida en el cliente — acá va a ir el POST multipart real
   * a `/api/m/[token]/items/[itemId]/upload` (endpoint del otro agente).
   * Por ahora anima una barra de progreso y, al terminar, la trata como
   * subida exitosa.
   */
  function simulateUpload(key: string, file: File) {
    let progress = 0;
    const step = () => {
      progress = Math.min(100, progress + 15 + Math.random() * 20);
      setPending((prev) => prev.map((p) => (p.key === key ? { ...p, progress } : p)));
      if (progress < 100) {
        window.setTimeout(step, 180);
      } else {
        window.setTimeout(() => {
          setPending((prev) => prev.map((p) => (p.key === key ? { ...p, done: true } : p)));
          onFilesAdded(item.id, [
            {
              id: key,
              nombre: file.name,
              pesoBytes: file.size,
              subidoEl: new Date().toISOString(),
            },
          ]);
          window.setTimeout(() => setPending((prev) => prev.filter((p) => p.key !== key)), 900);
        }, 150);
      }
    };
    window.setTimeout(step, 150);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="mp-item" id={`item-${item.id}`} data-open={open} data-resolved={resolved}>
      <button
        type="button"
        className="mp-item-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="mp-item-check"
          data-resolved={resolved}
          data-noaplica={state.estado === 'no_aplica'}
          aria-hidden
        >
          {resolved ? (state.estado === 'no_aplica' ? <X size={15} /> : <Check size={15} />) : null}
        </span>
        <span className="mp-item-head-text">
          <p className="mp-item-name">{item.nombre}</p>
          <span className="mp-item-tags">
            <span className="mp-badge" data-req={item.requisito}>
              {REQUISITO_LABEL[item.requisito]}
            </span>
            <span className="mp-item-status">{statusLabel(state)}</span>
          </span>
        </span>
        <ChevronDown size={20} className="mp-item-chevron" aria-hidden />
      </button>

      {open ? (
        <div className="mp-item-body">
          <div className="mp-item-explain">
            <div className="mp-item-explain-block">
              <h4>Qué es</h4>
              <p>{item.queEs}</p>
            </div>
            <div className="mp-item-explain-block">
              <h4>Para qué lo vamos a usar</h4>
              <p>{item.paraQue}</p>
            </div>
            <div className="mp-item-explain-block">
              <h4>Formato que necesitamos</h4>
              <p className="mp-item-format">{item.formato}</p>
            </div>
          </div>

          {item.quienLoHace || item.comoSeHace || item.dondeContratarlo || item.precioReferencia ? (
            <details className="mp-help">
              <summary>
                <HelpCircle size={17} aria-hidden />
                No lo tengo — ¿quién me lo puede hacer?
              </summary>
              <dl className="mp-help-body">
                {item.quienLoHace ? (
                  <>
                    <dt>Quién lo hace</dt>
                    <dd>{item.quienLoHace}</dd>
                  </>
                ) : null}
                {item.comoSeHace ? (
                  <>
                    <dt>Cómo se hace</dt>
                    <dd>{item.comoSeHace}</dd>
                  </>
                ) : null}
                {item.dondeContratarlo ? (
                  <>
                    <dt>Dónde contratarlo</dt>
                    <dd>{item.dondeContratarlo}</dd>
                  </>
                ) : null}
                {item.precioReferencia ? (
                  <>
                    <dt>Precio aproximado</dt>
                    <dd>{item.precioReferencia}</dd>
                  </>
                ) : null}
                <dt>Si no lo consiguen</dt>
                <dd>{item.siNoLoTienen}</dd>
              </dl>
            </details>
          ) : (
            <p className="mp-item-format" style={{ marginBottom: 18 }}>
              {item.siNoLoTienen}
            </p>
          )}

          {item.aceptaArchivos ? (
            <>
              <label
                className="mp-dropzone"
                htmlFor={inputId}
                data-dragging={dragging}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <span className="mp-dropzone-label">
                  <Paperclip size={22} aria-hidden />
                  <span className="mp-dropzone-cta">Tocá para elegir un archivo</span>
                  <span>o arrastralo acá{item.extensiones ? ` — ${item.extensiones.map((e) => `.${e}`).join(', ')}` : ''}</span>
                </span>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="file"
                  multiple
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>

              {(state.archivos.length > 0 || pending.length > 0) && (
                <div className="mp-file-list">
                  {state.archivos.map((file) => (
                    <div className="mp-file-row" key={file.id}>
                      <Check size={16} color="var(--ok)" aria-hidden />
                      <span className="mp-file-name">{file.nombre}</span>
                      <span className="mp-file-meta">{fmtMB(file.pesoBytes)}</span>
                    </div>
                  ))}
                  {pending.map((p) => (
                    <div className="mp-file-row" key={p.key} data-error={Boolean(p.error)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span className="mp-file-name">{p.file.name}</span>
                          <span className="mp-file-meta">{fmtMB(p.file.size)}</span>
                        </div>
                        {p.error ? (
                          <p className="mp-file-error">{p.error}</p>
                        ) : (
                          <div className="mp-file-progress-track">
                            <div className="mp-file-progress-fill" style={{ width: `${p.done ? 100 : p.progress}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {state.marcadoSinMaterial ? (
            <div className="mp-no-material-note">
              <MinusCircle size={18} aria-hidden />
              <span>
                Marcaste que no tenés este material{state.comentario ? `: "${state.comentario}"` : '.'}
              </span>
            </div>
          ) : null}

          <div className="mp-actions">
            {!state.marcadoSinMaterial ? (
              <button
                type="button"
                className="mp-btn"
                data-active={showNoTengoForm}
                onClick={() => setShowNoTengoForm((v) => !v)}
              >
                <MinusCircle size={16} aria-hidden />
                No lo tengo
              </button>
            ) : (
              <button type="button" className="mp-btn" onClick={() => onUndoNoTengo(item.id)}>
                <Undo2 size={16} aria-hidden />
                En realidad sí lo tengo
              </button>
            )}
            <button
              type="button"
              className="mp-btn"
              data-active={showCommentForm}
              onClick={() => setShowCommentForm((v) => !v)}
            >
              {state.comentario && !state.marcadoSinMaterial ? 'Editar comentario' : 'Dejar un comentario'}
            </button>
          </div>

          {showNoTengoForm ? (
            <div className="mp-comment-box">
              <label htmlFor={`${inputId}-notengo`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)' }}>
                Contanos por qué (opcional) — nos sirve para saber si hace falta coordinar algo.
              </label>
              <textarea
                id={`${inputId}-notengo`}
                value={noTengoText}
                onChange={(e) => setNoTengoText(e.target.value)}
                placeholder="Ej: no tenemos agrimensura digital, solo el plano en papel."
              />
              <div className="mp-actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="mp-btn"
                  data-variant="primary"
                  onClick={() => {
                    onMarkNoTengo(item.id, noTengoText.trim());
                    setShowNoTengoForm(false);
                  }}
                >
                  Confirmar
                </button>
                <button type="button" className="mp-btn" onClick={() => setShowNoTengoForm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {showCommentForm ? (
            <div className="mp-comment-box">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Cualquier aclaración que nos quieras dejar sobre este material."
              />
              <div className="mp-actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="mp-btn"
                  data-variant="primary"
                  onClick={() => {
                    onSaveComment(item.id, commentText.trim());
                    setShowCommentForm(false);
                  }}
                >
                  Guardar
                </button>
                <button type="button" className="mp-btn" onClick={() => setShowCommentForm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : state.comentario && !state.marcadoSinMaterial ? (
            <p className="mp-comment-saved">&ldquo;{state.comentario}&rdquo;</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
