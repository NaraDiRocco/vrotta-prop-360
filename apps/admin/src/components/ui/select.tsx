/**
 * Select nativo (h.7 del plan: no se reemplaza por un listbox custom — el
 * nativo ya es accesible y funciona en móvil/oscuro). Esta capa sólo le da
 * la altura y el chevron consistentes que hoy varían de archivo en archivo
 * (5 alturas distintas, según el plan). El chevron es decorativo y absoluto:
 * el `<select>` sigue siendo el 100 % del área clickeable.
 */
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...rest },
  ref,
) {
  return (
    <span className="r-select-wrap">
      <select ref={ref} className={['r-select', className].filter(Boolean).join(' ')} {...rest} />
      <ChevronDown className="r-select__chevron" size={14} aria-hidden focusable="false" />
    </span>
  );
});
