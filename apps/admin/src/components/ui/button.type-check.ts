/**
 * No es un test de vitest (no hace ninguna aserción en runtime): es un
 * chequeo de TIPOS que corre con `pnpm typecheck`. Si `iconOnly` deja de
 * exigir `aria-label` por un cambio accidental en `button.tsx`, el
 * `@ts-expect-error` de abajo deja de tener error que "esperar" y
 * `tsc --noEmit` falla el build — así "Button iconOnly sin aria-label no
 * compila" queda garantizado, no sólo documentado en un comentario.
 */
import { X } from 'lucide-react';
import type { ButtonProps } from './button.tsx';

// Válido: iconOnly con aria-label.
const ok: ButtonProps = { iconOnly: true, icon: X, 'aria-label': 'Cerrar' };

// @ts-expect-error — iconOnly sin aria-label no debe compilar.
const missingAriaLabel: ButtonProps = { iconOnly: true, icon: X };

// @ts-expect-error — iconOnly con children (texto invisible detrás del ícono) no debe compilar.
const iconOnlyWithChildren: ButtonProps = { iconOnly: true, icon: X, 'aria-label': 'Cerrar', children: 'Cerrar' };

// Válido: botón con texto, sin iconOnly.
const labeled: ButtonProps = { children: 'Guardar' };

void ok;
void missingAriaLabel;
void iconOnlyWithChildren;
void labeled;
