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
  /**
   * jsonb de `projects.settings` (0003_projects.sql) tal cual está en la
   * fila — nunca `undefined`, como mucho `null` si Supabase lo devolviera
   * así, aunque la columna es `not null default '{}'::jsonb`. El panel
   * guarda ahí su propia configuración (`initial_scene_id`,
   * `allowed_domains`, ver 0012_project_health_view.sql) y también, mezclados
   * con eso, los cinco campos opcionales del manifiesto que no tienen tabla
   * propia (theme, contact, brandLogo, photoTour, brochurePages). Quien hace
   * el pick de esas cinco claves nada más es `buildManifestFromSupabase` en
   * publish.ts — acá simplemente se trae la columna entera, sin interpretarla.
   */
  settings: Record<string, unknown> | null;
}

export async function resolveProject(
  db: SupabaseClient,
  tenantSlug: string,
  projectSlug: string,
): Promise<ResolvedProject | null> {
  const tenants = await db.select<{ id: string }[]>('tenants', `slug=eq.${tenantSlug}&select=id`);
  const tenant = tenants[0];
  if (!tenant) return null;

  const projects = await db.select<
    { id: string; published_version: number; settings: Record<string, unknown> | null }[]
  >('projects', `tenant_id=eq.${tenant.id}&slug=eq.${projectSlug}&select=id,published_version,settings`);
  const project = projects[0];
  if (!project) return null;

  return {
    tenantId: tenant.id,
    projectId: project.id,
    publishedVersion: project.published_version,
    settings: project.settings ?? null,
  };
}
