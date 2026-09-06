/**
 * Pestaña "Unidades": el camino de datos del plan §3 ("quiero 2 dormitorios
 * de menos de 120 m² disponible"). Con 20 unidades es un índice cómodo; con
 * 600 lotes es el buscador principal — mismo componente en las dos escalas.
 *
 * Hoja inferior con chips de filtro + lista agrupada por bloque. Cada cambio
 * de filtro se propaga a `onFilterChange` con el set de códigos que matchean
 * (o `null` cuando el filtro está vacío = "no restringir nada"), para que
 * `floorplan.ts` atenúe en el plano lo que no matchea — filtrar la lista y
 * filtrar el mapa son la misma acción (plan §3, el diferencial contra El
 * Nogal, que lo resuelve en un diálogo aparte del plano).
 *
 * Vive colgado del mismo `host` que `ui.ts` (`SceneController.host`), como
 * hermano de `.r360-ui`: no depende de esa capa ni la modifica.
 */
import type { AvailabilityFile, TourManifest } from '@r360/core';
import { STATUS_TOKENS } from '@r360/core';
import { escapeHtml } from './polygons.ts';
// La misma aritmética de "cuántas están en venta" que usa la pestaña Unidades
// de `ui.ts`: si divergen, el visitante lee dos stocks distintos del mismo
// proyecto en la misma pantalla.
import { lineaEnVenta, resumenEnVenta } from './unidad.ts';
import {
  EMPTY_FILTER,
  buildUnitRows,
  filterUnits,
  groupByBlock,
  isFilterEmpty,
  matchesFilter,
  tipologiasOf,
  type FilterState,
  type UnitRow,
} from './filters.ts';

export interface UnitsPanelOptions {
  host: HTMLElement;
  tour: TourManifest;
  /** Disponibilidad viva: se lee en cada apertura/refresco, no se cachea. */
  getAvailability: () => AvailabilityFile | null;
  onSelectUnit: (code: string) => void;
  /** `null` = sin filtro activo (plano y lista muestran todo). */
  onFilterChange: (matched: Set<string> | null) => void;
}

const NUM = new Intl.NumberFormat('es-AR');
const num = (v: number) => NUM.format(v);

function formatPrice(p: { a: number; c: string } | null): string {
  if (!p) return 'Consultar';
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: p.c, maximumFractionDigits: 0 }).format(p.a);
  } catch {
    return `${p.c} ${num(p.a)}`;
  }
}

export class UnitsPanel {
  private readonly root: HTMLElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly sheet: HTMLElement;
  private rows: UnitRow[] = [];
  private filter: FilterState = { ...EMPTY_FILTER };

  constructor(private readonly opts: UnitsPanelOptions) {
    this.root = document.createElement('div');
    this.root.className = 'r360-units-mount';
    this.root.innerHTML = `
      <button type="button" class="r360-units-toggle" aria-expanded="false">
        <span class="r360-units-toggle__icon">☰</span>
        <span class="r360-units-toggle__label"></span>
      </button>
      <div class="r360-units-sheet" hidden>
        <div class="r360-units-sheet__handle" aria-hidden="true"></div>
        <button type="button" class="r360-units-close" aria-label="Cerrar">×</button>
        <div class="r360-units-summary"></div>
        <div class="r360-units-chips"></div>
        <div class="r360-units-list"></div>
      </div>`;
    opts.host.appendChild(this.root);

    this.toggleBtn = this.root.querySelector('.r360-units-toggle')!;
    this.sheet = this.root.querySelector('.r360-units-sheet')!;

    this.toggleBtn.addEventListener('click', () => this.open());
    this.root.querySelector('.r360-units-close')!.addEventListener('click', () => this.close());
    this.sheet.addEventListener('click', (e) => this.onSheetClick(e));
    this.wireDragToClose();

    this.refresh();
  }

  destroy(): void {
    this.root.remove();
  }

  /** Vuelve a leer `availability` y repinta cabecera/lista. Llamar tras cada refresco. */
  refresh(): void {
    this.rows = buildUnitRows(this.opts.tour, this.opts.getAvailability());
    this.renderToggleLabel();
    if (!this.sheet.hidden) this.renderSheet();
  }

  /**
   * Cuántas unidades están EN VENTA. `rows` no sirve para contarlo: resuelve
   * el estado ausente al fallback `no_disponible` (regla dura del visor), así
   * que hay que preguntarle a `availability.json` directamente — el Bloque 3
   * está "próximamente" y B3-K no tiene estado, y ninguno de los dos es stock
   * (auditoría §2.15).
   */
  private resumen(): { enVenta: number; disponibles: number } {
    const avail = this.opts.getAvailability();
    return resumenEnVenta(this.rows.map((r) => r.code), (c) => avail?.units[c]?.s ?? null);
  }

  private renderToggleLabel(): void {
    const { enVenta, disponibles } = this.resumen();
    this.toggleBtn.querySelector('.r360-units-toggle__label')!.textContent =
      `Unidades · ${enVenta} en venta · ${disponibles} disp.`;
  }

  private open(): void {
    this.sheet.hidden = false;
    this.toggleBtn.setAttribute('aria-expanded', 'true');
    this.renderSheet();
  }

  private close(): void {
    this.sheet.hidden = true;
    this.toggleBtn.setAttribute('aria-expanded', 'false');
  }

  private renderSheet(): void {
    const matched = filterUnits(this.rows, this.filter);

    this.sheet.querySelector('.r360-units-summary')!.textContent = lineaEnVenta(this.resumen());
    this.sheet.querySelector('.r360-units-chips')!.innerHTML = this.chipsHtml();
    this.sheet.querySelector('.r360-units-list')!.innerHTML = this.listHtml(matched);

    this.emitFilterChange(matched);
  }

  private chipsHtml(): string {
    const tipologias = tipologiasOf(this.rows);
    const tipologiaOptions = ['<option value="">Tipología</option>']
      .concat(tipologias.map((t) => `<option value="${escapeHtml(t)}"${this.filter.tipologia === t ? ' selected' : ''}>${escapeHtml(t)}</option>`))
      .join('');
    return `
      <button type="button" class="r360-chip${this.filter.onlyAvailable ? ' is-on' : ''}" data-chip="onlyAvailable">
        Disponibles${this.filter.onlyAvailable ? ' ✓' : ''}
      </button>
      <select class="r360-chip r360-chip--select" data-chip="tipologia">${tipologiaOptions}</select>
      <select class="r360-chip r360-chip--select" data-chip="maxAreaM2">
        <option value="">m²</option>
        <option value="100"${this.filter.maxAreaM2 === 100 ? ' selected' : ''}>hasta 100 m²</option>
        <option value="150"${this.filter.maxAreaM2 === 150 ? ' selected' : ''}>hasta 150 m²</option>
        <option value="200"${this.filter.maxAreaM2 === 200 ? ' selected' : ''}>hasta 200 m²</option>
      </select>
      ${this.filter.onlyAvailable || this.filter.tipologia || this.filter.maxAreaM2 != null
        ? '<button type="button" class="r360-chip r360-chip--clear" data-chip="clear">Limpiar</button>'
        : ''}
    `;
  }

  private listHtml(matched: UnitRow[]): string {
    if (matched.length === 0) {
      return '<p class="r360-units-empty">Ninguna unidad cumple estos filtros.</p>';
    }
    const groups = groupByBlock(matched);
    return groups
      .map((g) => {
        const rows = g.units
          .map((u) => {
            const token = STATUS_TOKENS[u.status];
            const price = u.status === 'disponible' ? formatPrice(u.price) : token.label;
            const area = u.areaTotalM2 != null ? `${num(u.areaTotalM2)} m²` : '';
            const tip = u.tipologia ?? '';
            return `<button type="button" class="r360-units-row" data-unit="${escapeHtml(u.code)}">
                <i style="background:${token.base}"></i>
                <b>${escapeHtml(u.code)}</b>
                <span>${escapeHtml(tip)}</span>
                <span>${escapeHtml(area)}</span>
                <span class="r360-units-row__price">${escapeHtml(price)}</span>
                <span class="r360-units-row__go" aria-hidden="true">&rsaquo;</span>
              </button>`;
          })
          .join('');
        return `<div class="r360-units-group">
            <div class="r360-units-group__title">${escapeHtml(g.groupLabel)}</div>
            ${rows}
          </div>`;
      })
      .join('');
  }

  private onSheetClick(e: Event): void {
    const el = e.target as HTMLElement;
    const chip = el.closest<HTMLElement>('[data-chip]');
    if (chip) return this.onChipClick(chip);
    const row = el.closest<HTMLElement>('.r360-units-row');
    if (row?.dataset.unit) {
      this.close();
      this.opts.onSelectUnit(row.dataset.unit);
    }
  }

  private onChipClick(chip: HTMLElement): void {
    const key = chip.dataset.chip;
    if (key === 'onlyAvailable') {
      this.filter = { ...this.filter, onlyAvailable: !this.filter.onlyAvailable };
    } else if (key === 'clear') {
      this.filter = { ...EMPTY_FILTER };
    } else if (key === 'tipologia' && chip instanceof HTMLSelectElement) {
      this.filter = { ...this.filter, tipologia: chip.value || null };
    } else if (key === 'maxAreaM2' && chip instanceof HTMLSelectElement) {
      this.filter = { ...this.filter, maxAreaM2: chip.value ? Number(chip.value) : null };
    } else {
      return;
    }
    this.renderSheet();
  }

  // `<select>` dispara `click` también al abrir/cerrar el desplegable nativo;
  // el filtro real se aplica en `change`, no en `click`, para no relanzar el
  // render en cada apertura del combo.
  private onSelectChange = (e: Event): void => {
    const el = e.target as HTMLElement;
    if (el.matches('select[data-chip]')) this.onChipClick(el);
  };

  private emitFilterChange(matched: UnitRow[]): void {
    if (isFilterEmpty(this.filter)) {
      this.opts.onFilterChange(null);
      return;
    }
    this.opts.onFilterChange(new Set(matched.map((r) => r.code)));
  }

  private wireDragToClose(): void {
    const handle = this.sheet.querySelector<HTMLElement>('.r360-units-sheet__handle')!;
    let startY = 0;
    let dragging = false;
    const onStart = (y: number) => { dragging = true; startY = y; this.sheet.style.transition = 'none'; };
    const onMove = (y: number) => {
      if (!dragging) return;
      const dy = Math.max(0, y - startY);
      this.sheet.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = (y: number) => {
      if (!dragging) return;
      dragging = false;
      this.sheet.style.transition = '';
      const dy = y - startY;
      this.sheet.style.transform = '';
      if (dy > 80) this.close();
    };
    handle.addEventListener('touchstart', (e) => onStart(e.touches[0]!.clientY), { passive: true });
    handle.addEventListener('touchmove', (e) => onMove(e.touches[0]!.clientY), { passive: true });
    handle.addEventListener('touchend', (e) => onEnd(e.changedTouches[0]!.clientY));
    handle.addEventListener('mousedown', (e) => {
      onStart(e.clientY);
      const move = (ev: MouseEvent) => onMove(ev.clientY);
      const up = (ev: MouseEvent) => { onEnd(ev.clientY); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    // Los `<select>` de los chips usan `change`, delegado acá porque se crean
    // y destruyen en cada `renderSheet()`.
    this.sheet.addEventListener('change', this.onSelectChange);
  }
}

export function mountUnitsPanel(opts: UnitsPanelOptions): UnitsPanel {
  return new UnitsPanel(opts);
}
