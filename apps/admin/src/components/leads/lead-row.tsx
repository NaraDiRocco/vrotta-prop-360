'use client';

import type { LeadRow } from '@/lib/data/types.ts';
import { relativeTime } from '@/lib/leads/filters.ts';

const CHANNEL_LABEL: Record<string, string> = {
  form: 'Formulario',
  whatsapp: 'WhatsApp',
  crm_webhook: 'CRM',
};

export function LeadListRow({
  lead,
  selected,
  checked,
  onClick,
  onCheck,
  showProject,
}: {
  lead: LeadRow;
  selected: boolean;
  checked: boolean;
  onClick: () => void;
  onCheck: (checked: boolean) => void;
  showProject: boolean;
}) {
  return (
    <div
      className="r-row"
      data-selected={selected}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 56,
        padding: '0 10px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onCheck(e.target.checked)}
        style={{ flex: 'none' }}
      />
      {!lead.read && <span className="r-dot" style={{ background: 'var(--accent)', flex: 'none' }} aria-label="No leído" />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: lead.read ? 500 : 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.name}
          </span>
          {/* "hace N min/h/d" depende del instante en que se calcula: el
              server la arma al renderizar la página y el cliente la vuelve a
              calcular al hidratar, momentos distintos → texto distinto. Es
              el caso de libro de "reloj en pantalla" de React: se avisa a
              propósito que no hidrate estricto acá en vez de forzar un
              useEffect sólo para esto. */}
          <span suppressHydrationWarning style={{ fontSize: 10, color: 'var(--fg-faint)', flex: 'none' }}>
            {relativeTime(lead.createdAt)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11, color: 'var(--fg-muted)' }}>
          {lead.unitCode && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 6px',
                borderRadius: 999,
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
              }}
            >
              {lead.unitStatus && (
                <span className="r-dot" style={{ background: `var(--st-${lead.unitStatus})`, width: 6, height: 6 }} />
              )}
              {lead.unitCode}
            </span>
          )}
          {showProject && <span>{lead.projectName}</span>}
          <span>{CHANNEL_LABEL[lead.channel] ?? lead.channel}</span>
        </div>
      </div>
      <span
        style={{
          flex: 'none',
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
        }}
      >
        {lead.status}
      </span>
    </div>
  );
}
