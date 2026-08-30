import type { Metadata } from 'next';
import { MaterialPublicView } from '@/components/material-public/MaterialPublicView.tsx';
import { TokenErrorScreen } from '@/components/material-public/TokenErrorScreen.tsx';
import { EXAMPLE_CONTACT, EXAMPLE_PROJECT, buildExampleItemStates } from '@/components/material-public/example-data.ts';
import type { MaterialItemState, MaterialTokenResolution } from '@/components/material-public/types.ts';
import { buildPublicMaterialView } from '@/lib/material/public-view.ts';
import './material-public.css';

export const metadata: Metadata = {
  title: 'Material del proyecto',
  description: 'Subí el material que falta para tu recorrido 360°.',
  robots: { index: false, follow: false },
};

/**
 * Resuelve el token contra el backend real (`lib/material/**`) y adapta su
 * forma a la que consume esta vista.
 *
 * Sobre el adaptador: el servidor responde `{projectName, entries[], ...}` y
 * la vista trabaja con `{proyecto, items[]}`. Se traduce acá, en el borde, en
 * vez de alinear los dos contratos: el del servidor está pensado para no
 * filtrar nada comercial y el de la vista para leerse en un teléfono. Que
 * cada lado tenga el suyo es correcto; lo que no puede haber es dos fuentes
 * de verdad para el mismo dato, y no las hay.
 *
 * Un token revocado, vencido o inexistente devuelve el MISMO 404 desde el
 * servidor, a propósito: el link no debe delatar si alguna vez existió. Por
 * eso acá todo eso cae en 'invalido'. Las palabras reservadas de abajo son
 * sólo para poder ver las otras pantallas de error en desarrollo.
 */
async function resolveMaterialToken(token: string): Promise<MaterialTokenResolution> {
  if (process.env.NODE_ENV !== 'production') {
    if (token === 'vencido') return { status: 'vencido', contacto: EXAMPLE_CONTACT };
    if (token === 'revocado') return { status: 'revocado', contacto: EXAMPLE_CONTACT };
    if (token === 'demo') {
      return { status: 'ok', proyecto: EXAMPLE_PROJECT, items: buildExampleItemStates(EXAMPLE_PROJECT.kind) };
    }
  }
  if (token === 'invalido' || token.length < 4) return { status: 'invalido' };

  const data = await buildPublicMaterialView(token);
  if (!data) return { status: 'invalido' };

  return {
    status: 'ok',
    proyecto: { nombre: data.projectName, kind: data.projectKind },
    items: data.entries.map((entry) => ({
      item: entry.item as MaterialItemState['item'],
      estado: entry.status,
      archivos: entry.files.map((f) => ({
        id: f.id,
        nombre: f.filename,
        pesoBytes: f.sizeBytes,
        subidoEl: f.createdAt,
      })),
      comentario: null,
      marcadoSinMaterial: entry.status === 'no_aplica',
    })),
  };
}

export default async function MaterialTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolution = await resolveMaterialToken(token);

  if (resolution.status !== 'ok') {
    return <TokenErrorScreen resolution={resolution} />;
  }

  return <MaterialPublicView token={token} proyecto={resolution.proyecto} items={resolution.items} />;
}
