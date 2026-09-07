// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Dialog } from './dialog.tsx';

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        abrir afuera
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="titulo-test">
        <h2 id="titulo-test">Confirmar</h2>
        <button type="button">Cancelar</button>
        <button type="button">Confirmar</button>
      </Dialog>
    </div>
  );
}

describe('Dialog', () => {
  test('al abrir, mueve el foco adentro (al primer elemento enfocable)', () => {
    render(<Harness />);
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelar).toHaveFocus();
  });

  test('Tab en el último elemento vuelve al primero (atrapa el foco)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    confirmar.focus();
    expect(confirmar).toHaveFocus();
    await user.tab();
    expect(cancelar).toHaveFocus();
  });

  test('Shift+Tab en el primer elemento va al último', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(cancelar).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmar).toHaveFocus();
  });

  test('Esc cierra el diálogo (llama a onClose)', () => {
    render(<Harness />);
    const dialogEl = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialogEl.open).toBe(true);
    fireEvent.keyDown(dialogEl, { key: 'Escape' });
    expect(dialogEl.open).toBe(false);
  });

  test('onClose se llama y el padre puede reflejarlo en su estado', () => {
    const onClose = vi.fn();
    function Wrapper() {
      return (
        <Dialog open onClose={onClose} labelledBy="t2">
          <h2 id="t2">Título</h2>
          <button type="button">Único</button>
        </Dialog>
      );
    }
    render(<Wrapper />);
    const dialogEl = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.keyDown(dialogEl, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('un click cuyo target es el propio <dialog> (backdrop) cierra', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t3">
        <h2 id="t3">Título</h2>
        <button type="button">Único</button>
      </Dialog>,
    );
    const dialogEl = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.click(dialogEl);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('un click en el contenido NO cierra (no llega al backdrop)', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t4">
        <h2 id="t4">Título</h2>
        <button type="button">Único</button>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Único' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('no abierto: no renderiza como <dialog open>', () => {
    render(<Harness initialOpen={false} />);
    const dialogEl = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialogEl.open).toBe(false);
  });
});
