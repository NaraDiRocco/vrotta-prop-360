/**
 * Armado de la vista pública de material a partir de un token.
 *
 * Existe para que la página `/m/[token]` y el endpoint `/api/material/[token]`
 * produzcan exactamente lo mismo. Antes la lógica vivía sólo en el endpoint y
 * la página la habría duplicado: dos copias del recorte de datos que decide
 * qué ve alguien de afuera es justo el lugar donde no puede haber dos copias.
 *
 * Devuelve `null` para token inexistente, vencido o revocado — el mismo
 * resultado en los tres casos, a propósito: el link no debe delatar si alguna
 * vez existió.
 */
import { getRepo } from '../data/index.ts';
import { catalogFor } from './catalog.ts';
import { isShareTokenShaped, publicItem } from './share.ts';
import { signedMaterialUrl } from './storage.ts';
import { MAX_FILE_BYTES } from './uploads.ts';
import type { PublicMaterialEntry, PublicMaterialResponse } from './api-types.ts';
import type { MaterialStatus } from './types.ts';
import type { ProjectKind } from '@r360/core';

export interface PublicMaterialView extends PublicMaterialResponse {
  /** Necesario para adaptar el catálogo del lado de la vista. */
  projectKind: ProjectKind;
}

async function safeSignedUrl(storagePath: string): Promise<string | null> {
  try {
    return await signedMaterialUrl(storagePath, 'link');
  } catch {
    // Una URL firmada que falla no puede tumbar la página entera: el cliente
    // igual tiene que poder ver qué le falta y seguir subiendo.
    return null;
  }
}

export async function buildPublicMaterialView(token: string): Promise<PublicMaterialView | null> {
  if (!isShareTokenShaped(token)) return null;

  const repo = getRepo();
  const context = await repo.resolveMaterialShareToken(token);
  if (!context) return null;

  const data = await repo.readMaterialByToken(token);
  if (!data) return null;

  const statusById = new Map<string, MaterialStatus>(data.states.map((s) => [s.itemId, s.status]));
  const filesById = new Map<string, typeof data.files>();
  for (const file of data.files) {
    const list = filesById.get(file.itemId);
    if (list) list.push(file);
    else filesById.set(file.itemId, [file]);
  }

  const entries: PublicMaterialEntry[] = [];
  let obligatoriosFaltantes = 0;

  for (const item of catalogFor(context.projectKind)) {
    const status = statusById.get(item.id) ?? 'pendiente';
    if (item.requisito === 'obligatorio' && status !== 'aprobado' && status !== 'no_aplica') {
      obligatoriosFaltantes += 1;
    }
    const files = filesById.get(item.id) ?? [];
    entries.push({
      item: publicItem(item),
      status,
      files: await Promise.all(
        files.map(async (f) => ({
          id: f.id,
          itemId: f.itemId,
          filename: f.filename,
          sizeBytes: f.sizeBytes,
          createdAt: f.createdAt,
          url: await safeSignedUrl(f.storagePath),
        })),
      ),
    });
  }

  return {
    projectName: context.projectName,
    projectKind: context.projectKind,
    entries,
    obligatoriosFaltantes,
    maxFileBytes: MAX_FILE_BYTES,
  };
}
