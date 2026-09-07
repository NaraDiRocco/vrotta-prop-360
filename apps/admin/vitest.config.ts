import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // El tsconfig del proyecto usa `"jsx": "preserve"` (Next.js lo transforma
  // con su propio compilador en dev/build). Vitest no pasa por Next, así que
  // acá se le pide a esbuild el runtime automático de JSX (React 19, sin
  // `import React` en cada .tsx) para los nuevos tests de componentes.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mismo alias que tsconfig.json ("@/*" → "./src/*"); tsc lo resuelve
    // solo, pero vite/vitest no lee "paths" del tsconfig sin este espejo.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // 'node' sigue siendo el default (759 tests existentes dependen de esto:
    // p. ej. geojson-import.test.ts resuelve rutas con `new URL(import.meta.url)`
    // y falla bajo jsdom, que pisa el `URL` global). La Ola 1.A suma tests de
    // componentes (Dialog atrapa foco, cierra con Esc) que sí necesitan DOM:
    // esos archivos declaran `// @vitest-environment jsdom` en su primera
    // línea en vez de cambiar el default para todos.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
