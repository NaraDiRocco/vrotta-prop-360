'use client';

/** Ayuda de atajos (`?`). Es la referencia de un editor que se opera de memoria. */
const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Navegar',
    rows: [
      ['n', 'siguiente unidad SIN polígono'],
      ['p', 'anterior unidad SIN polígono'],
      ['j / k', 'bajar / subir en la lista'],
      ['f', 'centrar la vista en la selección'],
      ['espacio', 'mantener para desplazar la vista'],
    ],
  },
  {
    title: 'Modos',
    rows: [
      ['v', 'seleccionar'],
      ['d', 'dibujar'],
      ['a', 'editar vértices'],
    ],
  },
  {
    title: 'Dibujar',
    rows: [
      ['click', 'agregar vértice'],
      ['Enter · doble click', 'cerrar el polígono'],
      ['⌫', 'borrar el último vértice'],
      ['Esc', 'cancelar el trazo'],
    ],
  },
  {
    title: 'Editar',
    rows: [
      ['arrastrar vértice', 'mover'],
      ['arrastrar punto medio', 'insertar vértice'],
      ['arrastrar ✥', 'mover el polígono entero'],
      ['⌫', 'borrar el vértice o el polígono'],
    ],
  },
  {
    title: 'Imantado',
    rows: [
      ['s', 'activar / desactivar'],
      ['⌥ (sostenido)', 'desactivar mientras se sostiene'],
    ],
  },
  {
    title: 'Trabajo',
    rows: [
      ['⌘D', 'duplicar en la siguiente unidad libre'],
      ['⌘Z / ⌘⇧Z', 'deshacer / rehacer'],
      ['⌘S', 'guardar ya'],
      ['⌘I', 'importar GeoJSON'],
      ['1…5', 'estado de la unidad seleccionada'],
      ['l', 'mostrar / ocultar etiquetas'],
      ['?', 'esta ayuda'],
    ],
  },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="ed-modal-bg" onClick={onClose} role="presentation">
      <div className="ed-modal" style={{ width: 'min(680px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="ed-modal__head">
          Atajos
          <button type="button" className="ed-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="ed-modal__body">
          <div className="ed-help">
            {SECTIONS.map((section) => (
              <div key={section.title} style={{ display: 'contents' }}>
                <div className="ed-help__title">{section.title}</div>
                {section.rows.map(([key, what]) => (
                  <div className="ed-help__row" key={key}>
                    <span className="ed-kbd">{key}</span>
                    <span>{what}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
