/**
 * Vista pública del material, resuelta por token.
 *
 * NO exige sesión: es exactamente el caso de uso (el cliente abre el link
 * desde WhatsApp). Todo lo que devuelve está recortado a un solo proyecto y
 * limpio de datos internos — ver el encabezado de `lib/material/share.ts`.
 *
 * Un token inexistente, revocado o vencido devuelven los tres el MISMO 404 con
 * el mismo cuerpo: un link viejo no sirve ni para confirmar que el proyecto
 * existe.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { buildPublicMaterialView } from '@/lib/material/public-view.ts';
import type { PublicMaterialResponse } from '@/lib/material/api-types.ts';

const NOT_FOUND = { error: 'El link no existe o ya no está vigente' };

export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // La construccion vive en lib/material/public-view.ts porque la comparte la
  // pagina /m/[token]. Token inexistente, vencido o revocado devuelven null y
  // se responden con el MISMO 404: el link no debe delatar si alguna vez existio.
  const view = await buildPublicMaterialView(token);
  if (!view) return NextResponse.json(NOT_FOUND, { status: 404 });

  const body: PublicMaterialResponse = {
    projectName: view.projectName,
    entries: view.entries,
    obligatoriosFaltantes: view.obligatoriosFaltantes,
    maxFileBytes: view.maxFileBytes,
  };
  return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
}
