'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { dismissKey, type StartupChecklist as Checklist } from '@/lib/onboarding/checklist.ts';

/**
 * Checklist de arranque en el resumen del proyecto.
 *
 * Se colapsa solo cuando está completo — un proyecto en marcha no necesita
 * que le recuerden lo que ya hizo — y se puede descartar del todo. El
 * descarte vive en localStorage por proyecto: es una preferencia de vista de
 * este operador en esta máquina, no un dato del proyecto.
 */
export function StartupChecklist({ projectId, checklist }: { projectId: string; checklist: Checklist }) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(!checklist.complete);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey(projectId)) === '1');
    } catch {
      /* navegador sin storage: se muestra */
    }
    setHydrated(true);
  }, [projectId]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(projectId), '1');
    } catch {
      /* ignorar */
    }
  }

  if (!hydrated || dismissed) return null;

  const pct = Math.round((checklist.done / checklist.total) * 100);

  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '7px 10px',
          background: 'var(--bg-subtle)',
          borderBottom: open ? '1px solid var(--border)' : undefined,
        }}
      >
        <button
          type="button"
          className="r-btn"
          data-variant="ghost"
          style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? 'Colapsar' : 'Expandir'}
        >
          {open ? '▾' : '▸'}
        </button>
        <strong style={{ fontSize: 12 }}>Puesta en marcha</strong>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {checklist.done}/{checklist.total}
        </span>
        <div style={{ width: 90, height: 4, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: checklist.complete ? 'var(--ok)' : 'var(--accent)' }} />
        </div>
        {!open && checklist.next && (
          <span style={{ fontSize: 11, color: 'var(--fg-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Sigue: {checklist.next.title}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="r-btn" data-variant="ghost" style={{ height: 22 }} onClick={dismiss}>
          Descartar
        </button>
      </header>

      {open && (
        <ol>
          {checklist.steps.map((step, i) => (
            <li
              key={step.id}
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'baseline',
                padding: '7px 10px',
                borderTop: i === 0 ? undefined : '1px solid var(--border)',
                opacity: step.done ? 0.6 : 1,
              }}
            >
              <span
                className="tnum"
                style={{ width: 16, flex: 'none', color: step.done ? 'var(--ok)' : 'var(--fg-faint)' }}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: step.done ? 400 : 600 }}>
                  {step.title}
                  {step.optional && !step.done && (
                    <span style={{ fontWeight: 400, color: 'var(--fg-faint)', fontSize: 11 }}> · opcional</span>
                  )}
                </div>
                {step.detail && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{step.detail}</div>}
              </div>
              {!step.done && (
                <Link href={step.href} className="r-btn" data-variant="ghost" style={{ flex: 'none' }}>
                  {step.action} →
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
