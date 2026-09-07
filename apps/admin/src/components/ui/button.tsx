'use client';

/**
 * Button único del sistema, sobre `.r-btn` (que ya existía). Reemplaza los
 * `r-btn` sueltos con `style={{ height: 20/22/24 }}` y los `✕`/`→` de texto
 * (ver plan d): `variant` cubre primary/secondary/ghost/danger, `size`
 * cambia densidad visual sin tocar el blanco de click (ver abajo), e `icon`
 * es siempre un componente de Lucide — nunca un glyph.
 *
 * La altura NUNCA es un número: siempre `var(--control-h)`, así un botón se
 * ve distinto en compacta/cómoda sin que este archivo lo sepa. `size="sm"`
 * achica tipografía y padding para contextos densos (una fila de tabla,
 * una tira de chips), pero deliberadamente NO achica la altura: es la forma
 * de cumplir el criterio de blanco de click del plan (≥24×24 compacta,
 * ≥32×32 cómoda) sin tener que pensarlo en cada lugar donde se usa `sm`.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícono de Lucide, nunca un carácter Unicode (regla dura del sistema). */
  icon?: LucideIcon;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

/** Botón con texto: `children` obligatorio, `iconOnly` ausente o `false`. */
type LabeledButtonProps = CommonProps & {
  iconOnly?: false;
  children: ReactNode;
};

/**
 * Botón sólo-ícono: `aria-label` es OBLIGATORIO a nivel de tipo. Es la pieza
 * central del plan: hoy hay ocho botones sólo-ícono con `title` (invisible
 * por teclado/lector) y cero `aria-label`; con esta forma, un botón mudo no
 * compila. `children` queda prohibido para que no se cuele texto invisible
 * detrás del ícono.
 */
type IconOnlyButtonProps = CommonProps & {
  iconOnly: true;
  icon: LucideIcon;
  'aria-label': string;
  children?: never;
};

export type ButtonProps = LabeledButtonProps | IconOnlyButtonProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconOnly, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Dentro de un <form> (login, unit-sheet) un <button> sin type
      // envía el formulario por default del navegador — casi nunca lo que
      // se quiere de un botón secundario/ghost.
      type={type ?? 'button'}
      className={['r-btn', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly ? 'true' : undefined}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden focusable="false" />}
      {!iconOnly && children}
    </button>
  );
});
