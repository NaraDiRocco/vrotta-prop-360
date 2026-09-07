/**
 * Un test de render por primitiva (criterio "Terminado" de la Ola 1.A). No
 * busca agotar variantes — eso lo hace mirar `/dev/ui` a ojo — sino
 * garantizar que cada componente monta, expone el rol/atributo de
 * accesibilidad que promete, y no explota con las props mínimas.
 */
// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from './button.tsx';
import { Field } from './field.tsx';
import { Select } from './select.tsx';
import { EmptyState } from './empty-state.tsx';
import { Skeleton, SkeletonRows, SkeletonCard } from './skeleton.tsx';
import { ConfirmDialog } from './confirm-dialog.tsx';
import { ToastProvider, useToast } from './toast.tsx';
import { Banner } from './banner.tsx';
import { Pill, StatusPill, LeadStatusPill } from './pill.tsx';
import { Tabs } from './tabs.tsx';
import { PageHeader } from './page-header.tsx';

test('Button: variante/tamaño por data-attr, ícono opcional', () => {
  render(
    <Button variant="primary" size="sm" icon={Save}>
      Guardar
    </Button>,
  );
  const btn = screen.getByRole('button', { name: 'Guardar' });
  expect(btn).toHaveAttribute('data-variant', 'primary');
  expect(btn).toHaveAttribute('data-size', 'sm');
});

test('Button iconOnly: el aria-label queda como nombre accesible del botón', () => {
  render(<Button iconOnly icon={Save} aria-label="Guardar" />);
  expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('data-icon-only', 'true');
});

test('Field: label conecta con el control y el error tiene role="alert"', () => {
  render(
    <Field label="Precio" error="Requerido" hint="En dólares">
      <input />
    </Field>,
  );
  const input = screen.getByLabelText('Precio');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Requerido');
  // El hint desaparece cuando hay error (compiten por la misma atención).
  expect(screen.queryByText('En dólares')).not.toBeInTheDocument();
});

test('Select: envuelve un <select> real con el mismo valor/onChange', () => {
  render(
    <Select aria-label="Estado" value="a" onChange={() => {}}>
      <option value="a">A</option>
      <option value="b">B</option>
    </Select>,
  );
  expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('a');
});

test('EmptyState: título + descripción + data-ui="empty-state" para QA', () => {
  render(<EmptyState icon={Save} title="Sin leads" description="Todavía no llegó ninguno." />);
  expect(screen.getByText('Sin leads')).toBeInTheDocument();
  expect(screen.getByText('Todavía no llegó ninguno.')).toBeInTheDocument();
  expect(document.querySelector('[data-ui="empty-state"]')).toBeInTheDocument();
});

test('Skeleton: rows lee --row-h y expone un solo role=status para el grupo', () => {
  render(<SkeletonRows count={3} label="Cargando unidades" />);
  const status = screen.getByRole('status', { name: 'Cargando unidades' });
  expect(status.children).toHaveLength(3);
});

test('SkeletonCard y Skeleton base montan sin romper', () => {
  render(<SkeletonCard label="Cargando escena" />);
  expect(screen.getByRole('status', { name: 'Cargando escena' })).toBeInTheDocument();
  render(<Skeleton data-testid="bloque" />);
  expect(screen.getByTestId('bloque')).toBeInTheDocument();
});

test('ConfirmDialog: título, descripción y el botón peligroso dispara onConfirm', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Marcar como vendida"
      description="Esto va a marcar 12 unidades como vendidas."
      danger
      confirmLabel="Marcar vendidas"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  expect(screen.getByText('Esto va a marcar 12 unidades como vendidas.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Marcar vendidas' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('Toast: useToast() sin <ToastProvider> explota con un mensaje claro (falla rápido, no en silencio)', () => {
  const { result } = renderHook(() => {
    try {
      useToast();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(result.current).toMatch(/ToastProvider/);
});

test('Toast: show() monta un role=status con el texto y desaparece con Deshacer', () => {
  function Demo() {
    const show = useToast();
    return (
      <button type="button" onClick={() => show({ text: 'Cambios guardados', onUndo: () => {} })}>
        disparar
      </button>
    );
  }
  render(
    <ToastProvider>
      <Demo />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
  expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados');
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('Banner: tone="danger" es role="alert"; el resto no interrumpe', () => {
  render(<Banner tone="danger">Falló el guardado.</Banner>);
  expect(screen.getByRole('alert')).toHaveTextContent('Falló el guardado.');
});

test('Pill / StatusPill / LeadStatusPill: montan con el tono/label esperado', () => {
  render(<Pill tone="ok">Publicado</Pill>);
  expect(screen.getByText('Publicado')).toHaveAttribute('data-tone', 'ok');

  render(<StatusPill status="disponible" />);
  expect(screen.getByText('Disponible')).toBeInTheDocument();

  render(<LeadStatusPill status="descartado" />);
  const pill = screen.getByText('Descartado');
  expect(pill).toHaveAttribute('data-tone', 'faint');
});

test('Tabs: role=tablist, flecha derecha mueve la selección a la siguiente pestaña', () => {
  function Demo() {
    const [value, setValue] = useState('a');
    return (
      <Tabs
        aria-label="Detalle de unidad"
        value={value}
        onChange={setValue}
        items={[
          { value: 'a', label: 'Datos' },
          { value: 'b', label: 'Precio' },
        ]}
      />
    );
  }
  render(<Demo />);
  const tabA = screen.getByRole('tab', { name: 'Datos' });
  const tabB = screen.getByRole('tab', { name: 'Precio' });
  expect(tabA).toHaveAttribute('aria-selected', 'true');
  tabA.focus();
  fireEvent.keyDown(tabA, { key: 'ArrowRight' });
  expect(tabB).toHaveAttribute('aria-selected', 'true');
});

test('PageHeader: título + acciones', () => {
  render(<PageHeader title="Equipo" description="Quién puede entrar" actions={<button type="button">Invitar</button>} />);
  expect(screen.getByRole('heading', { name: 'Equipo' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Invitar' })).toBeInTheDocument();
});
