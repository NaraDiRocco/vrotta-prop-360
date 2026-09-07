'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Actor, LeadPatch, LeadRow, LeadStatus } from '@/lib/data/types.ts';
import { canDeleteLead, canManageLeads } from '@/lib/roles.ts';

const STATUS_OPTIONS: LeadStatus[] = ['nuevo', 'contactado', 'calificado', 'descartado', 'ganado'];

const STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  descartado: 'Descartado',
  ganado: 'Ganado',
};

// `timeZone` fijo y `hour12: false` por lo mismo que en material/format.ts:
// sin esos dos, el server (Node, otra zona horaria) y el navegador arman un
// string distinto para la misma fecha y React tira error de hidratación
// apenas este panel se abra en el primer render.
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Montevideo',
  });
}

export function LeadDetail({
  lead,
  actor,
  onPatch,
  onDelete,
}: {
  lead: LeadRow;
  actor: Actor;
  onPatch: (leadId: string, patch: LeadPatch) => void;
  onDelete: (leadId: string) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  // Vrotta Operador ve los leads (para dar soporte) pero no los gestiona: el
  // seguimiento comercial es de la inmobiliaria. Borrar es todavía más
  // acotado — sólo Administrador y Vrotta Admin (`canDeleteLead`).
  const puedeGestionar = canManageLeads(actor);
  const puedeBorrar = canDeleteLead(actor);

  useEffect(() => setNotes(lead.notes ?? ''), [lead.id, lead.notes]);

  const waNumber = lead.phone?.replace(/[^\d]/g, '');

  return (
    <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{lead.name}</h2>
        {puedeBorrar && (
          <button
            type="button"
            className="r-btn"
            data-variant="ghost"
            title="Borrar lead"
            style={{ color: 'var(--ui-danger)' }}
            onClick={() => {
              if (window.confirm(`Borrar el lead de ${lead.name}? No se puede deshacer.`)) onDelete(lead.id);
            }}
          >
            <Trash2 size={13} strokeWidth={1.75} aria-hidden />
            Borrar
          </button>
        )}
      </div>
      {/* fmtDate formatea en huso horario local: server y cliente pueden
          diferir, así que se avisa a propósito que no hidrate estricto acá
          en vez de forzar un useEffect sólo para esto. */}
      <div suppressHydrationWarning style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
        {lead.projectName} · {fmtDate(lead.createdAt)}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="r-btn">
            Llamar
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="r-btn">
            Email
          </a>
        )}
        {waNumber && (
          <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="r-btn" data-variant="primary">
            WhatsApp
          </a>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Estado">
          {puedeGestionar ? (
            <select
              className="r-input"
              style={{ width: 160 }}
              value={lead.status}
              onChange={(e) => onPatch(lead.id, { status: e.target.value as LeadStatus })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          ) : (
            <span>{STATUS_LABEL[lead.status]}</span>
          )}
        </Field>

        <Field label="Unidad de interés">
          {lead.unitCode ? (
            <span>
              {lead.unitCode} {lead.unitStatus ? `· ${lead.unitStatus}` : ''}
            </span>
          ) : (
            <span style={{ color: 'var(--fg-faint)' }}>—</span>
          )}
        </Field>

        <Field label="Contacto">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lead.email && <span>{lead.email}</span>}
            {lead.phone && <span>{lead.phone}</span>}
            {!lead.email && !lead.phone && <span style={{ color: 'var(--fg-faint)' }}>—</span>}
          </div>
        </Field>

        <Field label="Mensaje">
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{lead.message ?? '—'}</p>
        </Field>

        <Field label="Origen">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--fg-muted)' }}>
            <span>URL: {lead.source?.url ?? '—'}</span>
            <span>Referrer: {lead.source?.referrer ?? '—'}</span>
            <span>Dispositivo: {lead.source?.device ?? '—'}</span>
            {lead.source?.utm && Object.keys(lead.source.utm).length > 0 && (
              <span>UTM: {Object.entries(lead.source.utm).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
            )}
          </div>
        </Field>

        <Field label="Notas internas">
          {puedeGestionar ? (
            <textarea
              className="r-input"
              style={{ height: 70, resize: 'vertical', paddingTop: 6 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (lead.notes ?? '')) onPatch(lead.id, { notes });
              }}
            />
          ) : (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: lead.notes ? undefined : 'var(--fg-faint)' }}>
              {lead.notes ?? '—'}
            </p>
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12 }}>{children}</div>
    </div>
  );
}
