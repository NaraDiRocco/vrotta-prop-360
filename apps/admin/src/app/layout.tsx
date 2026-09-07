import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { StatusStyles } from '@/components/status.tsx';
import { QueryProvider } from '@/components/query-provider.tsx';
import { THEME_STORAGE_KEY } from '@/lib/theme.ts';
import { DENSITY_STORAGE_KEY, defaultDensityForSession } from '@/lib/density.ts';
import { getSession } from '@/lib/auth.ts';
import './globals.css';

/**
 * Inter variable, self-hosted (subset latin, 48 KB, cero requests externas).
 *
 * La pila del sistema no sirve acá: la métrica del panel está calibrada a 13px
 * con filas de 32px, y SF/Segoe/Roboto dibujan anchos y altura-x distintos. Con
 * `next/font/local` el fallback métrico lo calcula el propio Next, así que el
 * swap no mueve el layout.
 */
const inter = localFont({
  src: '../fonts/Inter-Variable-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Vrotta Prop 360 — Panel',
  description: 'Panel de administración de recorridos y disponibilidad.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El shell de ventas se usa con una mano; que el navegador no haga zoom solo
  // al enfocar un input, pero sin bloquear el pinch-zoom de accesibilidad.
  maximumScale: 5,
};

/**
 * Aplica el tema guardado ANTES del primer pintado. Sin esto el panel arranca
 * claro y salta a oscuro cuando hidrata React, que es peor que no tener toggle.
 * El default es claro: si no hay nada guardado no se toca nada, y la preferencia
 * del sistema operativo no participa (decisión de producto).
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

/**
 * Igual que el tema, pero con una vuelta más: acá el default NO es fijo,
 * sale del rol (`defaultDensityForSession`, ver lib/density.ts). Por eso el
 * server ya manda el atributo correcto en el HTML (evita el flash para quien
 * todavía no eligió nada) y el script sólo lo pisa si hay una preferencia
 * guardada explícita que difiera de ese default — la persona que cambió de
 * densidad una vez no vuelve a ver la de su rol.
 */
function densityBootstrap(defaultDensity: string): string {
  return `try{var d=localStorage.getItem(${JSON.stringify(DENSITY_STORAGE_KEY)});if((d==="compact"||d==="comfortable")&&d!==${JSON.stringify(defaultDensity)})document.documentElement.setAttribute("data-density",d)}catch(e){}`;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const defaultDensity = defaultDensityForSession(session);

  return (
    <html
      lang="es"
      className={inter.variable}
      data-density={defaultDensity}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: densityBootstrap(defaultDensity) }} />
      </head>
      <body>
        <StatusStyles />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
