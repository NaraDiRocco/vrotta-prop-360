'use client';

import { useState } from 'react';
import { Copy, Link2, X } from 'lucide-react';
import { formatDate } from './format.ts';
import type { MaterialShareLink } from './types.ts';

function whatsappText(projectName: string, url: string): string {
  return `Hola! Para avanzar con el recorrido 360° de ${projectName} necesitamos que nos suban el material pendiente. Pueden hacerlo directo desde este link, sin necesidad de crear una cuenta: ${url}`;
}

/**
 * Panel de links compartibles. Se abre como diálogo desde el botón del
 * header. Punto de conexión futuro: `onCreate`/`onRevoke` hoy tocan el
 * estado local del screen; cuando existan `POST`/`DELETE
 * /api/p/[project]/material/links` pasan a pegarle a la API con la misma
 * firma.
 */
export function SharePanel({
  projectName,
  shareBaseUrl,
  links,
  onCreate,
  onRevoke,
  onClose,
  creating,
}: {
  projectName: string;
  shareBaseUrl: string;
  links: MaterialShareLink[];
  onCreate: () => void;
  onRevoke: (id: string) => void;
  onClose: () => void;
  creating?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const active = links.filter((l) => !l.revoked);

  async function copy(token: string, id: string) {
    const url = `${shareBaseUrl}?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* portapapeles no disponible: el link igual está visible para copiar a mano */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="r-surface"
        style={{ width: 480, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto', padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600 }}>Link para el cliente</h2>
          <button type="button" className="r-btn" data-variant="ghost" onClick={onClose} style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}>
            <X size={13} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          Genera un link para que el cliente suba material directamente, sin necesidad de acceder al panel.
        </p>

        <button type="button" className="r-btn" data-variant="primary" onClick={onCreate} disabled={creating} style={{ marginBottom: 12 }}>
          <Link2 size={13} strokeWidth={1.75} aria-hidden />
          Generar link
        </button>

        {active.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--fg-muted)' }}>No hay links activos.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {active.map((link) => {
              const url = `${shareBaseUrl}?token=${link.token}`;
              return (
                <div key={link.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>
                      {url}
                    </code>
                    <button
                      type="button"
                      className="r-btn"
                      data-variant="ghost"
                      onClick={() => void copy(link.token, link.id)}
                      style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                    >
                      <Copy size={11} strokeWidth={1.75} aria-hidden />
                      {copiedId === link.id ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      className="r-btn"
                      data-variant="ghost"
                      onClick={() => onRevoke(link.id)}
                      style={{ height: 22, padding: '0 6px', fontSize: 11, color: 'var(--ui-danger)' }}
                    >
                      Revocar
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4 }}>
                    creado {formatDate(link.createdAt)} · {link.createdByEmail}
                  </div>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 10, color: 'var(--fg-muted)', cursor: 'pointer' }}>Texto para WhatsApp</summary>
                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--fg)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border)',
                        borderRadius: 5,
                        padding: 8,
                        marginTop: 4,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {whatsappText(projectName, url)}
                    </p>
                    <button
                      type="button"
                      className="r-btn"
                      data-variant="ghost"
                      style={{ height: 20, padding: '0 6px', fontSize: 10, marginTop: 4 }}
                      onClick={() => void navigator.clipboard.writeText(whatsappText(projectName, url))}
                    >
                      Copiar texto
                    </button>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
