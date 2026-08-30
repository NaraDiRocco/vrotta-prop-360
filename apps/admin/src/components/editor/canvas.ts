'use client';

/**
 * Contrato común de los dos lienzos.
 *
 * El editor no sabe si abajo hay una panorámica o un plano. Le pide dos cosas:
 * traducir pantalla↔escena y repintar. Eso permite que el panel de unidades, el
 * reducer, el snap, el historial y los atajos sean EXACTAMENTE los mismos
 * código para las escenas `panorama` y para las `floorplan`/`map`.
 *
 * Regla no negociable: la traducción pantalla↔esfera la hace Photo Sphere
 * Viewer (`dataHelper`), no matemática propia. Si el editor proyectara distinto
 * que el visor, los polígonos quedarían corridos — una clase entera de bugs que
 * se evita no escribiendo el código que la produce.
 */
import type { PolyStatus } from '@/lib/editor/style.ts';
import type { Pt } from '@/lib/editor/records.ts';

export interface ScreenPoint {
  x: number;
  y: number;
  /** false si el punto está detrás de la cámara: el tirador no se dibuja. */
  visible: boolean;
}

export interface CanvasApi {
  /** Coordenadas del puntero (cliente) → coordenadas de escena. */
  fromClient(clientX: number, clientY: number): Pt | null;
  /** Escena → píxeles relativos al contenedor del lienzo. */
  toScreen(p: Pt): ScreenPoint | null;
  /** Encuadra el anillo. Es lo que hace `f`. */
  focus(ring: readonly Pt[]): void;
  /** Texto para la barra de estado ("zoom 42 %" / "×2.4"). */
  zoomLabel(): string;
}

export interface RenderPoly {
  id: string;
  ring: readonly Pt[];
  status: PolyStatus;
  label: string | null;
  selected: boolean;
}

export interface CanvasEvents {
  /** El lienzo está montado y se puede proyectar. */
  onReady(api: CanvasApi): void;
  /** La vista cambió (rotación, zoom, resize): hay que reubicar los tiradores. */
  onViewChange(): void;
  /** Click simple. `hotspotId` viene del hit-testing propio del lienzo. */
  onPick(point: Pt, hotspotId: string | null, event: { shiftKey: boolean; altKey: boolean }): void;
  /** Doble click: cierra el polígono en curso. */
  onCommit(point: Pt): void;
}

export interface CanvasProps extends CanvasEvents {
  polygons: readonly RenderPoly[];
  showLabels: boolean;
}
