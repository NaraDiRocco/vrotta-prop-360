import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Dónde va a vivir el sitio. En GitHub Pages queda bajo
  // `/<repositorio>/`, no en la raíz del dominio: sin esto, cada asset se
  // pide a `/assets/...` y el sitio abre en blanco. Se pasa por entorno
  // (`VITE_BASE=/vrotta-prop-360/ pnpm build`) para no atar el build a un
  // hosting: en Cloudflare Pages o en un dominio propio la base es `/`.
  base: process.env.VITE_BASE ?? '/',
  // @r360/core se publica como TypeScript fuente (workspace link): Vite lo
  // transpila junto al app en vez de pre-bundlearlo.
  optimizeDeps: { exclude: ['@r360/core'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'index.html'),
        spike: resolve(__dirname, 'spike/index.html'),
      },
    },
  },
});
