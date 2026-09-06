'use client';

import { useState } from 'react';
import { PLATFORM_ROLE_LABEL } from '@/lib/roles.ts';
import type { PlatformMemberRow, PlatformRole } from '@/lib/data/types.ts';
import { FIELD_HINT, FIELD_LABEL, PANEL } from '@/components/onboarding/shared.tsx';

/**
 * Equipo de Vrotta: lista + alta (sólo de gente que YA tiene cuenta) +
 * cambio de rol + baja. Todo pega directo a `/api/admin/team`, sin
 * react-query: es una pantalla chica que un solo Vrotta Admin usa de vez en
 * cuando, no vale la pena la maquinaria de caché de las tablas grandes.
 */
export function TeamScreen({
  initialMembers,
  currentUserId,
}: {
  initialMembers: PlatformMemberRow[];
  currentUserId: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('operator');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/admin/team');
    if (!res.ok) return;
    const payload = (await res.json()) as { members: PlatformMemberRow[] };
    setMembers(payload.members);
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (email.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude sumarlo al equipo.');
      setEmail('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude sumarlo al equipo.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, nextRole: PlatformRole) {
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, role: nextRole }),
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

  async function remove(userId: string) {
    if (!window.confirm('¿Sacar a esta persona del equipo de Vrotta?')) return;
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/team?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude sacarlo.');
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude sacarlo.');
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="r-surface" style={{ overflow: 'hidden' }}>
        <table className="r-table">
          <thead>
            <tr>
              <th className="r-th">Email</th>
              <th className="r-th" style={{ width: 160 }}>
                Rol
              </th>
              <th className="r-th" style={{ width: 90 }} />
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
                    onChange={(e) => changeRole(m.userId, e.target.value as PlatformRole)}
                    style={{ height: 24, fontSize: 11 }}
                  >
                    <option value="admin">{PLATFORM_ROLE_LABEL.admin}</option>
                    <option value="operator">{PLATFORM_ROLE_LABEL.operator}</option>
                  </select>
                </td>
                <td className="r-td" style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="r-btn"
                    data-variant="ghost"
                    disabled={rowBusy === m.userId || m.userId === currentUserId}
                    title={m.userId === currentUserId ? 'No podés sacarte a vos mismo' : 'Sacar del equipo'}
                    onClick={() => remove(m.userId)}
                    style={{ height: 22, fontSize: 11 }}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={addMember} style={{ ...PANEL, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 3 }}>
          <label htmlFor="tm-email" style={FIELD_LABEL}>
            Sumar a alguien del equipo
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="tm-email"
              className="r-input"
              style={{ flex: 1 }}
              type="email"
              placeholder="nombre@vrotta.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="r-input"
              value={role}
              onChange={(e) => setRole(e.target.value as PlatformRole)}
              style={{ width: 160 }}
            >
              <option value="operator">{PLATFORM_ROLE_LABEL.operator}</option>
              <option value="admin">{PLATFORM_ROLE_LABEL.admin}</option>
            </select>
            <button type="submit" className="r-btn" data-variant="primary" disabled={busy || email.trim().length === 0}>
              {busy ? 'Sumando…' : 'Sumar'}
            </button>
          </div>
          <span style={FIELD_HINT}>
            Sólo funciona si esa persona YA tiene una cuenta creada en Recorrido 360. Invitar a alguien sin cuenta
            todavía no está — es el sistema de invitaciones, que se suma más adelante.
          </span>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      </form>
    </div>
  );
}
