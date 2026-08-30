import type { MaterialProjectSummary } from './types.ts';

export function Header({ proyecto }: { proyecto: MaterialProjectSummary }) {
  return (
    <header className="mp-header">
      <p className="mp-eyebrow">Material para {proyecto.nombre}</p>
      <h1 className="mp-title">Nos falta un poco de material</h1>
      <p className="mp-lede">
        Con esto armamos el recorrido 360° interactivo de tu proyecto. Subí lo que tengas — no hace falta
        que esté todo de una vez, y si algo no lo tenés, te explicamos cómo conseguirlo.
      </p>
    </header>
  );
}
