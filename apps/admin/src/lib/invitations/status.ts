/**
 * Deriva el estado visible de una invitación a partir de sus fechas. Vive
 * acá (no en la base) para no repetir la misma comparación de fechas en
 * `MockRepo` y `SupabaseRepo`: una sola función, un solo lugar para
 * cambiarla si el criterio cambia.
 */
export function invitationStatus(row: {
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}): 'pendiente' | 'aceptada' | 'vencida' | 'revocada' {
  if (row.revokedAt) return 'revocada';
  if (row.acceptedAt) return 'aceptada';
  if (new Date(row.expiresAt).getTime() <= Date.now()) return 'vencida';
  return 'pendiente';
}
