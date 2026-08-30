import type { SupabaseClient } from './supabase.ts';

/**
 * Resuelve el (tenant_slug, project_slug) de la URL a los ids uuid reales de
 * Supabase. Ver supabase/migrations/0002_tenants_memberships.sql y
 * 0003_projects.sql: `tenants.slug` y `projects.slug` (único por tenant) son
 * justamente lo que este Worker recibe como `:tenant` y `:project` en las
 * rutas.
 */
export interface ResolvedProject {
  tenantId: string;
  projectId: string;
  publishedVersion: number;
}

export async function resolveProject(
  db: SupabaseClient,
  tenantSlug: string,
  projectSlug: string,
): Promise<ResolvedProject | null> {
  const tenants = await db.select<{ id: string }[]>('tenants', `slug=eq.${tenantSlug}&select=id`);
  const tenant = tenants[0];
  if (!tenant) return null;

  const projects = await db.select<{ id: string; published_version: number }[]>(
    'projects',
    `tenant_id=eq.${tenant.id}&slug=eq.${projectSlug}&select=id,published_version`,
  );
  const project = projects[0];
  if (!project) return null;

  return { tenantId: tenant.id, projectId: project.id, publishedVersion: project.published_version };
}
