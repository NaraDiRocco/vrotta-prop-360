'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast.tsx';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // El panel se opera con datos frescos pero sin pelear con el
            // usuario: nada de refetch al volver a la pestaña en medio de una
            // edición.
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {/* Único montaje del toast global (Ola 1.A): antes sólo existía dentro
          de units-screen. Vive acá, en la raíz de providers, para que
          cualquier pantalla pueda pedir useToast() sin volver a montarlo. */}
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
