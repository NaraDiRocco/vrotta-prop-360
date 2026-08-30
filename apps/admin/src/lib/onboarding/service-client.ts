/**
 * Cliente de Supabase con la service key.
 *
 * Existe por UN solo caso: crear un tenant. Las policies de `tenants` y
 * `memberships` sólo dejan escribir a quien ya es `owner` de ese tenant —
 * correcto, pero circular para el primer alta: nadie es owner de un tenant
 * que todavía no existe. El backend rompe el círculo creando el tenant y la
 * membership del usuario que lo pide, en ese orden, con privilegios de
 * servicio.
 *
 * No se usa para nada más. Todo el resto del panel escribe con la sesión del
 * usuario y su RLS.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function hasServiceKey(): boolean {
  return typeof process.env['SUPABASE_SERVICE_KEY'] === 'string' && process.env['SUPABASE_SERVICE_KEY'].length > 0;
}

export function createServiceClient(): SupabaseClient {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_KEY'];
  if (!url || !key) {
    throw new Error('Falta SUPABASE_SERVICE_KEY: sin ella el panel no puede dar de alta un tenant nuevo.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
