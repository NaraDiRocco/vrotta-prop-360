/**
 * Reglas de rol, sin dependencias de servidor: lo importan tanto los server
 * components como los componentes de cliente. (auth.ts arrastra next/headers y
 * supabase-js, que no pueden cruzar al bundle del navegador.)
 */
import type { Role } from './data/types.ts';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dueño',
  editor: 'Editor',
  sales: 'Ventas',
};

export function canEditStructure(role: Role): boolean {
  return role === 'owner' || role === 'editor';
}

export function canPublish(role: Role): boolean {
  return role === 'owner';
}
