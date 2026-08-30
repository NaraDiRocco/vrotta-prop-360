import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name}. Con NEXT_PUBLIC_R360_MOCK=1 el panel no necesita Supabase; ` +
        'si querés backend real, completá .env.local.',
    );
  }
  return value;
}

/**
 * Cliente de Supabase para server components, route handlers y server actions.
 * En server components la escritura de cookies falla (no hay respuesta que
 * mutar); se ignora a propósito y la renovación de sesión la hace el
 * middleware.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const item of items) store.set(item.name, item.value, item.options);
        } catch {
          /* server component: lo renueva el middleware */
        }
      },
    },
  });
}
