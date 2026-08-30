import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { StatusStyles } from '@/components/status.tsx';
import { QueryProvider } from '@/components/query-provider.tsx';
import './globals.css';

export const metadata: Metadata = {
  title: 'Recorrido 360 — Panel',
  description: 'Panel de administración de recorridos y disponibilidad.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El shell de ventas se usa con una mano; que el navegador no haga zoom solo
  // al enfocar un input, pero sin bloquear el pinch-zoom de accesibilidad.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <StatusStyles />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
