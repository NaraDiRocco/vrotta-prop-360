import { defineConfig } from 'vitest/config';

// Timeout generoso: cada test hace varios roundtrips reales a PostgREST +
// Postgres local (login, insert, select). No es una suite de unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Un solo hilo: los fixtures comparten dos tenants creados una vez en
    // beforeAll y no están pensados para correr en paralelo entre archivos.
    fileParallelism: false,
  },
});
