/**
 * Estado de ejemplo para la pantalla de Material. Sustituye a
 * `GET /api/p/[project]/material` mientras esa ruta no existe (la construye
 * otro agente en paralelo, ver `types.ts`). Los datos están pensados para
 * el proyecto "Baleia" del seed (complejo, 20 unidades) — algunos ítems
 * recibidos/aprobados, otros pendientes, para poder ver la pantalla con
 * progreso real en vez de todo en cero.
 */
import { MATERIAL_CATALOG } from './catalog.ts';
import type { MaterialItemState, MaterialShareLink } from './types.ts';

function file(itemId: string, idx: number, name: string, sizeBytes: number, daysAgo: number, email: string) {
  const uploadedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { id: `${itemId}-f${idx}`, itemId, name, sizeBytes, uploadedAt, uploadedByEmail: email };
}

const OPERADOR = 'naradirocco.97@gmail.com';
const CLIENTE = 'contacto@dacal.com.uy';

export function initialMaterialState(): MaterialItemState[] {
  return MATERIAL_CATALOG.map((item) => {
    switch (item.id) {
      case 'masterplan':
        return { itemId: item.id, status: 'aprobado', files: [file(item.id, 1, 'masterplan-baleia-v2.pdf', 4_200_000, 12, CLIENTE)] };
      case 'plantas-tipologia':
        return {
          itemId: item.id,
          status: 'recibido',
          files: [
            file(item.id, 1, 'planta-tipo-A.pdf', 1_100_000, 9, CLIENTE),
            file(item.id, 2, 'planta-tipo-B.pdf', 1_050_000, 9, CLIENTE),
          ],
        };
      case 'cortes-tecnicos':
        return { itemId: item.id, status: 'pendiente', files: [] };
      case 'renders-exteriores':
        return { itemId: item.id, status: 'aprobado', files: [file(item.id, 1, 'fachada-norte.jpg', 8_400_000, 5, OPERADOR)] };
      case 'renders-interiores':
        return { itemId: item.id, status: 'solicitado', files: [] };
      case 'renders-aereos':
        return { itemId: item.id, status: 'pendiente', files: [] };
      case 'panoramicas-360':
        return {
          itemId: item.id,
          status: 'recibido',
          files: [
            file(item.id, 1, 'pano-amenities-piscina.exr', 62_000_000, 3, OPERADOR),
            file(item.id, 2, 'pano-hall-acceso.exr', 58_000_000, 3, OPERADOR),
          ],
        };
      case 'video-institucional':
        return { itemId: item.id, status: 'no_aplica', files: [] };
      case 'fotografia-obra':
        return { itemId: item.id, status: 'pendiente', files: [] };
      case 'datos-comerciales':
        return { itemId: item.id, status: 'aprobado', files: [file(item.id, 1, 'listado-unidades-baleia.xlsx', 85_000, 15, CLIENTE)] };
      case 'logo':
        return { itemId: item.id, status: 'aprobado', files: [file(item.id, 1, 'logo-dacal.svg', 42_000, 20, CLIENTE)] };
      case 'paleta-tipografia':
        return { itemId: item.id, status: 'no_aplica', files: [] };
      case 'textos-copy':
        return { itemId: item.id, status: 'solicitado', files: [] };
      case 'legales':
        return { itemId: item.id, status: 'pendiente', files: [] };
      case 'contactos':
        return { itemId: item.id, status: 'recibido', files: [] };
      case 'ubicacion':
        return { itemId: item.id, status: 'aprobado', files: [] };
      case 'geojson':
        return { itemId: item.id, status: 'pendiente', files: [] };
      default:
        return { itemId: item.id, status: 'pendiente', files: [] };
    }
  });
}

export function initialShareLinks(): MaterialShareLink[] {
  return [
    {
      id: 'link-1',
      token: 'mtr_8f2a1c9e4b7d0a3f',
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      createdByEmail: OPERADOR,
      revoked: false,
    },
  ];
}
