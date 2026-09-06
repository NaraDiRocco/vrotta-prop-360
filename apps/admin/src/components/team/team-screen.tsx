'use client';

import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { ROLE_LABEL } from '@/lib/roles.ts';
import type { InvitationRow, Role, TenantMemberRow } from '@/lib/data/types.ts';
import { FIELD_HINT, FIELD_LABEL, PANEL } from '@/components/onboarding/shared.tsx';
import { formatDate, formatDateTime } from '@/components/material/format.ts';
import type { CreateInvitationResponse } from '@/app/api/t/[tenant]/invitations/route.ts';
import type { ResendInvitationResponse } from '@/app/api/t/[tenant]/invitations/[invitation]/route.ts';

const TENANT_ROLES: Role[] = ['owner', 'editor', 'sales'];

const STATUS_LABEL: Record<InvitationRow['status'], string> = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  vencida: 'Vencida',
  revocada: 'Revocada',
};

interface ProjectRef {
  id: string;
  name: string;
}

/**
 * Equipo de la inmobiliaria: miembros actuales (rol + proyectos asignados
 * para Vendedor) e invitaciones (pendientes, vencidas, revocadas). Todo pega
 * directo a `/api/t/[tenant]/...`, mismo criterio que `TeamScreen` de
 * `/admin/team`: es una pantalla chica que usa una sola persona de vez en
 * cuando, no una tabla grande que necesite caché.
 *
 * El link de invitación se muestra SIEMPRE que se crea o se reenvía, con
 * botón de copiar — no sólo cuando falla el mail. Hoy (sin SMTP) es el
 * único camino real para que la invitación le llegue a alguien: se manda a
 * mano por WhatsApp.
 */
export function TeamScreen({
  tenantSlug,
  initialMembers,
  initialInvitations,
  projects,
  currentUserId,
}: {
  tenantSlug: string;
  initialMembers: TenantMemberRow[];
  initialInvitations: InvitationRow[];
  projects: ProjectRef[];
  currentUserId: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('sales');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [lastLink, setLastLink] = useState<{ link: string; email: { sent: boolean; reason?: string } } | null>(null);
  const [copied, setCopied] = useState(false);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  async function refresh() {
    const res = await fetch(`/api/t/${tenantSlug}/invitations`);
    if (!res.ok) return;
    const payload = (await res.json()) as { invitations: InvitationRow[] };
    setInvitations(payload.invitations);
  }

  async function changeMemberRole(userId: string, nextRole: Role) {
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude cambiar el rol.');
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role: nextRole } : m)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude cambiar el rol.');
    } finally {
      setRowBusy(null);
    }
  }

  async function changeMemberProjects(userId: string, nextProjectIds: string[]) {
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectIds: nextProjectIds }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude asignar los proyectos.');
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, projectIds: nextProjectIds } : m)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude asignar los proyectos.');
    } finally {
      setRowBusy(null);
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm('¿Sacar a esta persona del equipo?')) return;
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/members/${userId}`, { method: 'DELETE' });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude sacarlo.');
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude sacarlo.');
    } finally {
      setRowBusy(null);
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (email.trim().length === 0 || inviting) return;
    setInviting(true);
    setError(null);
    setLastLink(null);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/invitations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role, projectIds: role === 'sales' ? projectIds : [] }),
      });
      const payload = (await res.json()) as CreateInvitationResponse & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude crear la invitación.');
      setEmail('');
      setProjectIds([]);
      setLastLink({ link: payload.link, email: payload.email });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude crear la invitación.');
    } finally {
      setInviting(false);
    }
  }

  async function revoke(invitationId: string) {
    if (!window.confirm('¿Revocar esta invitación? Quien la tenga no va a poder usarla más.')) return;
    setRowBusy(invitationId);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/invitations/${invitationId}`, { method: 'DELETE' });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude revocarla.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude revocarla.');
    } finally {
      setRowBusy(null);
    }
  }

  async function resend(invitationId: string) {
    setRowBusy(invitationId);
    setError(null);
    setLastLink(null);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/invitations/${invitationId}`, { method: 'POST' });
      const payload = (await res.json()) as ResendInvitationResponse & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude reenviarla.');
      setLastLink({ link: payload.link, email: payload.email });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude reenviarla.');
    } finally {
      setRowBusy(null);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles no disponible: el link igual está visible para copiar a mano */
    }
  }

  const pendingOrStale = invitations.filter((i) => i.status !== 'aceptada');

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600 }}>Miembros</h2>
        <div className="r-surface" style={{ overflow: 'hidden' }}>
          <table className="r-table">
            <thead>
              <tr>
                <th className="r-th">Email</th>
                <th className="r-th" style={{ width: 130 }}>Rol</th>
                <th className="r-th">Proyectos asignados</th>
                <th className="r-th" style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="r-row">
                  <td className="r-td">{m.email}</td>
                  <td className="r-td">
                    <select
                      className="r-input"
                      value={m.role}
                      disabled={rowBusy === m.userId}
                      onChange={(e) => changeMemberRole(m.userId, e.target.value as Role)}
                      style={{ height: 24, fontSize: 11 }}
                    >
                      {TENANT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="r-td" style={{ fontSize: 11 }}>
                    {m.role !== 'sales' ? (
                      <span style={{ color: 'var(--fg-faint)' }}>No aplica</span>
                    ) : (
                      <div style={{ display: 'grid', gap: 2 }}>
                        <span style={{ color: 'var(--fg-faint)' }}>
                          {m.projectIds.length === 0 ? 'Todos los proyectos (sin restricción)' : `${m.projectIds.length} de ${projects.length}`}
                        </span>
                        <ProjectPicker
                          projects={projects}
                          selected={m.projectIds}
                          disabled={rowBusy === m.userId}
                          onChange={(next) => changeMemberProjects(m.userId, next)}
                        />
                      </div>
                    )}
                  </td>
                  <td className="r-td" style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="r-btn"
                      data-variant="ghost"
                      disabled={rowBusy === m.userId || m.userId === currentUserId}
                      title={m.userId === currentUserId ? 'No podés sacarte a vos mismo' : 'Sacar del equipo'}
                      onClick={() => removeMember(m.userId)}
                      style={{ height: 22, fontSize: 11 }}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td className="r-td" colSpan={4} style={{ color: 'var(--fg-faint)' }}>
                    Todavía no hay nadie en el equipo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600 }}>Invitaciones</h2>
        <div className="r-surface" style={{ overflow: 'hidden' }}>
          <table className="r-table">
            <thead>
              <tr>
                <th className="r-th">Email</th>
                <th className="r-th" style={{ width: 100 }}>Rol</th>
                <th className="r-th" style={{ width: 90 }}>Estado</th>
                <th className="r-th" style={{ width: 100 }}>Vence</th>
                <th className="r-th" style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {pendingOrStale.map((inv) => (
                <tr key={inv.id} className="r-row">
                  <td className="r-td">{inv.email}</td>
                  <td className="r-td">{inv.role ? ROLE_LABEL[inv.role] : '—'}</td>
                  <td className="r-td">{STATUS_LABEL[inv.status]}</td>
                  <td className="r-td" title={formatDateTime(inv.expiresAt)}>{formatDate(inv.expiresAt)}</td>
                  <td className="r-td" style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {(inv.status === 'pendiente' || inv.status === 'vencida') && (
                      <button
                        type="button"
                        className="r-btn"
                        data-variant="ghost"
                        disabled={rowBusy === inv.id}
                        onClick={() => resend(inv.id)}
                        style={{ height: 22, fontSize: 11 }}
                      >
                        Reenviar
                      </button>
                    )}
                    {inv.status === 'pendiente' && (
                      <button
                        type="button"
                        className="r-btn"
                        data-variant="ghost"
                        disabled={rowBusy === inv.id}
                        onClick={() => revoke(inv.id)}
                        style={{ height: 22, fontSize: 11, color: 'var(--ui-danger)' }}
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pendingOrStale.length === 0 && (
                <tr>
                  <td className="r-td" colSpan={5} style={{ color: 'var(--fg-faint)' }}>
                    No hay invitaciones pendientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <form onSubmit={invite} style={{ ...PANEL, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 3 }}>
          <label htmlFor="inv-email" style={FIELD_LABEL}>
            Invitar a alguien
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="inv-email"
              className="r-input"
              style={{ flex: 1, minWidth: 200 }}
              type="email"
              placeholder="nombre@inmobiliaria.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="r-input"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setProjectIds([]);
              }}
              style={{ width: 160 }}
            >
              {TENANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <button type="submit" className="r-btn" data-variant="primary" disabled={inviting || email.trim().length === 0}>
              {inviting ? 'Invitando…' : 'Invitar'}
            </button>
          </div>
          {role === 'sales' && (
            <div style={{ marginTop: 4 }}>
              <span style={FIELD_HINT}>Proyectos a los que va a tener acceso (vacío = todos):</span>
              <ProjectPicker projects={projects} selected={projectIds} onChange={setProjectIds} />
            </div>
          )}
          <span style={FIELD_HINT}>
            Hoy no hay servidor de correo configurado: aunque se intenta mandar el mail, lo más seguro es copiar el
            link de acá abajo y mandarlo por WhatsApp.
          </span>
        </div>

        {lastLink && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'grid', gap: 6 }}>
            <p style={{ fontSize: 11, color: lastLink.email.sent ? 'var(--fg-muted)' : 'var(--danger)' }}>
              {lastLink.email.sent
                ? 'Se mandó un correo con este link.'
                : `No se pudo mandar el correo${lastLink.email.reason ? ` (${lastLink.email.reason})` : ''}: copiá el link y mandalo vos.`}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lastLink.link}>
                {lastLink.link}
              </code>
              <button
                type="button"
                className="r-btn"
                data-variant="ghost"
                onClick={() => void copyLink(lastLink.link)}
                style={{ height: 22, padding: '0 6px', fontSize: 11 }}
              >
                <Copy size={11} strokeWidth={1.75} aria-hidden />
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a className="r-btn" data-variant="ghost" style={{ height: 22, padding: '0 6px', fontSize: 11 }} href={lastLink.link} target="_blank" rel="noreferrer">
                <Link2 size={11} strokeWidth={1.75} aria-hidden />
                Abrir
              </a>
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      </form>
    </div>
  );
}

function ProjectPicker({
  projects,
  selected,
  disabled,
  onChange,
}: {
  projects: ProjectRef[];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  if (projects.length === 0) {
    return <span style={{ color: 'var(--fg-faint)' }}>Sin proyectos todavía.</span>;
  }
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {projects.map((p) => {
        const active = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(p.id)}
            className="r-btn"
            data-variant={active ? 'primary' : 'ghost'}
            style={{ height: 20, padding: '0 6px', fontSize: 10 }}
            title={active ? 'Tiene acceso — click para quitar' : 'Sin acceso — click para dar'}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
