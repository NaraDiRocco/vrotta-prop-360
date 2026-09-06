// lib/env.ts
// De dónde saca este harness la URL/keys de Supabase, y la barrera dura que
// impide que corra contra el servidor real por accidente.
//
// Por qué una barrera en código y no sólo en el README: un env var mal export
// ado en la terminal (herencia de otra sesión, un .env sourceado a mano) es
// exactamente el tipo de error humano que un README no previene. Esto sí.

const PROD_HOST = '179.199.142.5';

// Valores por defecto = los que imprime `supabase start` para ESTE proyecto
// (supabase/config.toml: api.port=54921, db.port=54922). Son claves demo
// públicas de Supabase (mismo valor en cualquier instalación local del CLI,
// nunca secretas), documentadas en supabase/README.md del propio proyecto.
// Se pueden pisar por env var si alguien corrió `supabase start` con otro
// puerto, pero NUNCA para apuntar a un host que no sea local (ver abajo).
const DEFAULT_API_URL = 'http://127.0.0.1:54921';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DEFAULT_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const API_URL = process.env.SUPABASE_URL ?? DEFAULT_API_URL;
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SERVICE_KEY;

function assertLocalOnly(url: string, label: string) {
  if (url.includes(PROD_HOST)) {
    throw new Error(
      `${label} apunta a ${PROD_HOST}: ese es el VPS de producción, con datos reales de ` +
        'inmobiliarias. Este harness de RLS NUNCA corre ahí. Abortando antes de abrir ' +
        'ninguna conexión.',
    );
  }
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(url);
  if (!isLocal) {
    throw new Error(
      `${label} = "${url}" no es 127.0.0.1/localhost. Por seguridad este harness rechaza ` +
        'cualquier destino que no sea un Supabase local levantado con `supabase start`. ' +
        'Si tenés un puerto distinto, seteá SUPABASE_URL a http://127.0.0.1:<puerto>.',
    );
  }
}

assertLocalOnly(API_URL, 'SUPABASE_URL');
