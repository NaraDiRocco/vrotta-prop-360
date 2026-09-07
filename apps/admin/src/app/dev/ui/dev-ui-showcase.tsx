'use client';

/**
 * Catálogo interactivo de `src/components/ui/`. Cada sección es una
 * primitiva; los controles de arriba cambian tema/densidad en vivo sobre
 * `<html>` para mirar las cuatro combinaciones sin salir de la página.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Building2, Inbox, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { UNIT_STATUSES } from '@r360/core';
import { Button } from '@/components/ui/button.tsx';
import { Field } from '@/components/ui/field.tsx';
import { Select } from '@/components/ui/select.tsx';
import { EmptyState } from '@/components/ui/empty-state.tsx';
import { Skeleton, SkeletonRows, SkeletonCard } from '@/components/ui/skeleton.tsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.tsx';
import { useToast } from '@/components/ui/toast.tsx';
import { Banner, type BannerTone } from '@/components/ui/banner.tsx';
import { Pill, StatusPill, LeadStatusPill, type PillTone } from '@/components/ui/pill.tsx';
import { Tabs } from '@/components/ui/tabs.tsx';
import { PageHeader } from '@/components/ui/page-header.tsx';
import { LEAD_STATUSES } from '@/lib/leads/status.ts';
import { applyTheme, readStoredTheme, type Theme } from '@/lib/theme.ts';
import { applyDensity, readStoredDensity, type Density } from '@/lib/density.ts';

const PILL_TONES: PillTone[] = ['neutral', 'accent', 'ok', 'warn', 'danger', 'faint'];
const BANNER_TONES: BannerTone[] = ['info', 'warn', 'danger', 'ok'];

export function DevUiShowcase() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [density, setDensity] = useState<Density>(() => readStoredDensity('compact'));

  // El bootstrap inline del layout raíz (igual que en cualquier pantalla
  // real) es lo que debería dejar `<html>` ya en el tema/densidad guardados
  // antes del primer paint. Este efecto es sólo un cinturón de seguridad
  // PROPIO de esta página de catálogo: si por lo que sea el atributo real
  // de `<html>` no coincide con la preferencia guardada (por ejemplo, un
  // hard-reload en medio de un cambio), lo reconcilia una vez al montar —
  // así el botón nunca miente sobre qué se está mirando.
  useEffect(() => {
    applyTheme(theme);
    applyDensity(density);
    // Dependencias vacías a propósito: sólo corre una vez, al montar. Después
    // de esto el usuario manda con los botones de arriba.
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  function toggleDensity() {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    applyDensity(next);
    setDensity(next);
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 80px', display: 'grid', gap: 32 }}>
      <PageHeader
        title="/dev/ui — catálogo de primitivas"
        description="Sólo en modo demo. Ola 1.A del plan de diseño: cada bloque de abajo es una pieza de src/components/ui/."
        actions={
          <>
            <Button variant="secondary" onClick={toggleTheme}>
              Tema: {theme === 'dark' ? 'oscuro' : 'claro'}
            </Button>
            <Button variant="secondary" onClick={toggleDensity}>
              Densidad: {density === 'compact' ? 'compacta' : 'cómoda'}
            </Button>
          </>
        }
      />

      <Section title="Button" description="variant × primary/secondary/ghost/danger, size × sm/md, icon opcional, iconOnly exige aria-label.">
        <Row>
          <Button variant="primary" icon={Save}>
            Guardar
          </Button>
          <Button variant="secondary" icon={Plus}>
            Agregar
          </Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger" icon={Trash2}>
            Eliminar
          </Button>
        </Row>
        <Row>
          <Button variant="primary" size="sm">
            Primario chico
          </Button>
          <Button variant="secondary" size="sm">
            Secundario chico
          </Button>
          <Button iconOnly icon={X} aria-label="Cerrar" variant="ghost" />
          <Button iconOnly icon={Trash2} aria-label="Eliminar unidad" variant="danger" />
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
        </Row>
      </Section>

      <Section title="Field" description="label + control + hint + error, aria-describedby automático.">
        <Row wrap>
          <Field label="Nombre" hint="Como figura en el contrato">
            <input className="r-input" placeholder="Ej: Baleia SA" />
          </Field>
          <Field label="Precio" required error="Ingresá un monto válido">
            <input className="r-input" defaultValue="-1" />
          </Field>
        </Row>
      </Section>

      <Section title="Select" description="nativo, altura y chevron del sistema.">
        <Row>
          <Field label="Estado">
            <Select defaultValue="disponible">
              {UNIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
        </Row>
      </Section>

      <Section title="EmptyState" description="título + explicación + acción opcional (gated por rol).">
        <Row wrap>
          <div style={{ flex: '1 1 260px', border: '1px solid var(--border)', borderRadius: 8 }}>
            <EmptyState
              icon={Inbox}
              title="Sin leads"
              description="Todavía no llegó ningún contacto para este proyecto."
            />
          </div>
          <div style={{ flex: '1 1 260px', border: '1px solid var(--border)', borderRadius: 8 }}>
            <EmptyState
              icon={Building2}
              title="No hay proyectos"
              description="Creá el primero para empezar a cargar unidades."
              action={
                <Button variant="primary" icon={Plus}>
                  Nuevo proyecto
                </Button>
              }
            />
          </div>
        </Row>
      </Section>

      <Section title="Skeleton" description="sin shimmer — rows imita filas de tabla, card el placeholder 16:9.">
        <Row wrap>
          <div style={{ flex: '1 1 260px' }}>
            <SkeletonRows count={4} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <SkeletonCard />
          </div>
        </Row>
      </Section>

      <DialogSection />

      <ToastSection />

      <Section title="Banner" description="data-tone = info/warn/danger/ok, ícono Lucide por tono.">
        <div style={{ display: 'grid', gap: 8 }}>
          {BANNER_TONES.map((tone) => (
            <Banner key={tone} tone={tone}>
              {BANNER_COPY[tone]}
            </Banner>
          ))}
        </div>
      </Section>

      <Section title="Pill / StatusPill / LeadStatusPill">
        <Row wrap>
          {PILL_TONES.map((tone) => (
            <Pill key={tone} tone={tone}>
              {tone}
            </Pill>
          ))}
        </Row>
        <p className="r-field__hint" style={{ marginTop: 12 }}>
          StatusPill (vocabulario de unidad, @r360/core):
        </p>
        <Row wrap>
          {UNIT_STATUSES.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </Row>
        <p className="r-field__hint" style={{ marginTop: 12 }}>
          LeadStatusPill (vocabulario propio del panel, src/lib/leads/status.ts):
        </p>
        <Row wrap>
          {LEAD_STATUSES.map((status) => (
            <LeadStatusPill key={status} status={status} />
          ))}
        </Row>
      </Section>

      <TabsSection />

      <Section title="PageHeader" description="ya en uso arriba de esta misma página.">
        <p className="r-field__hint">Ver el encabezado de /dev/ui: título, descripción y las acciones de tema/densidad.</p>
      </Section>
    </main>
  );
}

const BANNER_COPY: Record<BannerTone, string> = {
  info: 'Vrotta está trabajando en el resto de las escenas de este proyecto.',
  warn: 'Hay 3 unidades sin polígono asignado.',
  danger: 'No se pudo guardar el cambio de estado. Reintentá.',
  ok: 'El recorrido se publicó correctamente.',
};

function DialogSection() {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Dialog / ConfirmDialog" description="<dialog> nativo: showModal(), foco atrapado, Esc cierra.">
      <Row>
        <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>
          Marcar 12 unidades como vendidas
        </Button>
      </Row>
      <ConfirmDialog
        open={open}
        title="Marcar como vendidas"
        description="Esto va a marcar 12 unidades como vendidas. La acción se puede deshacer desde el toast que aparece después."
        confirmLabel="Marcar vendidas"
        danger
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </Section>
  );
}

function ToastSection() {
  const show = useToast();
  return (
    <Section title="Toast" description="provider global, montado en query-provider.tsx. role=status, 4-6s, con Deshacer opcional.">
      <Row>
        <Button variant="secondary" onClick={() => show({ text: 'Cambios guardados', tone: 'ok' })}>
          Disparar ok
        </Button>
        <Button variant="secondary" onClick={() => show({ text: 'No se pudo guardar el precio', tone: 'error' })}>
          Disparar error
        </Button>
        <Button
          variant="secondary"
          icon={Undo2}
          onClick={() => show({ text: '3 leads marcados como contactados', onUndo: () => show({ text: 'Deshecho' }) })}
        >
          Disparar con Deshacer
        </Button>
      </Row>
    </Section>
  );
}

function TabsSection() {
  const [value, setValue] = useState('datos');
  return (
    <Section title="Tabs" description="role=tablist, subrayado en la activa, flechas ←→ mueven el foco.">
      <Tabs
        aria-label="Ejemplo de tabs"
        value={value}
        onChange={setValue}
        items={[
          { value: 'datos', label: 'Datos' },
          { value: 'precio', label: 'Precio' },
          { value: 'historial', label: 'Historial' },
        ]}
      />
      <p className="r-field__hint" style={{ marginTop: 8 }}>
        Pestaña activa: {value}
      </p>
    </Section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>{title}</h2>
        {description && (
          <p className="r-field__hint" style={{ margin: '2px 0 0' }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 8, alignItems: 'flex-start' }}>
      {children}
    </div>
  );
}
