import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
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
