/**
 * Acepta una invitación con la sesión actual. Ruta pública en el sentido de
 * que no depende de ningún tenant en la URL (`/invite/[token]` es la única
 * pantalla que la llama) pero SÍ exige sesión: es lo que compara
 * `accept_invitation` contra el email de la invitación (ver migración 0020).
 *
 * Nunca usa `requireSession()` (redirige): esto es un Route Handler, no una
 * página — mismo motivo que `resolveTenantActor` en `lib/auth.ts`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export interface AcceptInvitationResponse {
  scope: 'tenant' | 'platform';
  tenantSlug: string | null;
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { token } = await ctx.params;

  try {
    const result = await getRepo().acceptInvitation(token);
    return NextResponse.json(result satisfies AcceptInvitationResponse);
  } catch (cause) {
    // Los mensajes de `accept_invitation` (vencida, revocada, ya aceptada,
    // para otro email) ya están pensados para mostrarse tal cual.
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No pude aceptar la invitación.' },
      { status: 400 },
    );
  }
}
