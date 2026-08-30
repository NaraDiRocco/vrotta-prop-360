/**
 * Acceso al bucket `material`.
 *
 * Dos caminos, a propósito distintos:
 *
 *  - Panel: escribe con la sesión del usuario. Las policies de
 *    `storage.objects` (ver 0016) sólo lo dejan tocar la carpeta de un
 *    proyecto donde es owner o editor, así que aunque el route handler tuviera
 *    un bug, la base no lo deja escribir en el proyecto de otro.
 *  - Link público: `anon` NO tiene policy sobre el bucket. La subida la hace
 *    el backend con la service key DESPUÉS de validar el token, la extensión y
 *    el tamaño. Es la única forma de no convertir el bucket en un depósito
 *    abierto para cualquiera que sepa su nombre.
 *
 * El bucket es privado: nada se sirve por URL pública. Las descargas van por
 * URL firmada de vida corta.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabase/server.ts';
import { createServiceClient, hasServiceKey } from '../onboarding/service-client.ts';
import { isMockMode } from '../data/repo.ts';

export const MATERIAL_BUCKET = 'material';

/** Vida de las URLs firmadas: alcanza para hacer click, no para reenviar. */
export const SIGNED_URL_SECONDS = 300;

export class MaterialStorageError extends Error {}

async function clientFor(via: 'panel' | 'link'): Promise<SupabaseClient> {
  if (via === 'link') {
    if (!hasServiceKey()) {
      throw new MaterialStorageError(
        'Falta SUPABASE_SERVICE_KEY: sin ella el backend no puede guardar lo que sube el cliente por el link.',
      );
    }
    return createServiceClient();
  }
  return createSupabaseServerClient();
}

/** Sube los bytes. En modo mock no hay storage: se resuelve sin hacer nada. */
export async function putMaterialObject(
  path: string,
  body: ArrayBuffer,
  mime: string,
  via: 'panel' | 'link',
): Promise<void> {
  if (isMockMode()) return;
  const supabase = await clientFor(via);
  const { error } = await supabase.storage.from(MATERIAL_BUCKET).upload(path, body, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new MaterialStorageError(error.message);
}

/** URL firmada de descarga, o null en modo mock (no hay archivo real). */
export async function signedMaterialUrl(path: string, via: 'panel' | 'link'): Promise<string | null> {
  if (isMockMode()) return null;
  const supabase = await clientFor(via);
  const { data, error } = await supabase.storage.from(MATERIAL_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new MaterialStorageError(error.message);
  return data?.signedUrl ?? null;
}

export async function removeMaterialObject(path: string): Promise<void> {
  if (isMockMode()) return;
  const supabase = await clientFor('panel');
  const { error } = await supabase.storage.from(MATERIAL_BUCKET).remove([path]);
  if (error) throw new MaterialStorageError(error.message);
}
