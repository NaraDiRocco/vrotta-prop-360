/**
 * Cliente de Supabase con la service key.
 *
 * Ya NO lo usa el alta de tenant (P2b): con la policy `tenants_insert` de la
 * migración 0019, un Vrotta Admin crea el tenant con su propia sesión — no
 * hace falta romper ninguna circularidad de RLS.
 *
 * Se sigue usando para lo que la RLS del usuario no puede resolver:
 *  - `storage.ts`, para guardar material subido por el cliente vía link
 *    público (sin sesión, no hay RLS de usuario que aplicar).
 *  - `supabase-repo.ts`, en `/admin/team`, para resolver el email de un
 *    `user_id` de `platform_members` (leer `auth.users` sólo se puede con
 *    la Admin API) y para sumar a alguien que YA tiene cuenta buscándolo
 *    por email. Ninguno de los dos manda invitaciones ni crea cuentas: eso
 *    es el sistema de invitaciones (P2c), que va a sumar su propio uso acá.
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
