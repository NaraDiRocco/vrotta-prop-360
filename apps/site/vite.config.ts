import { defineConfig } from 'vite'

// El recorrido 360 corre en su propia app (`@r360/viewer`). El sitio lo
// embebe en un iframe: en dev se apunta al puerto del viewer, en produccion
// a la ruta donde se publique. Se cambia con VITE_TOUR_URL.
export default defineConfig({
  server: { port: 5190 },
  build: { target: 'es2022' },
})
