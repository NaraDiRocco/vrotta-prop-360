import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { MaterialScreen } from '@/components/material/material-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);
  // Ver qué falta y subir material es de TODOS los roles de inmobiliaria
  // (canViewMaterial/canUploadMaterial son true para owner/editor y para
  // plataforma); lo único que se recorta adentro de la pantalla es aprobar
  // o marcar "no aplica", que es criterio de Vrotta.

  const repo = getRepo();
  const project = await repo.getProject(tenant, projectSlug);
  if (!project) notFound();

  // Estado REAL del material, leído en el servidor. Antes esta pantalla se
  // montaba sobre datos de ejemplo porque la API todavía no existía; ya existe.
  const [states, files, links] = await Promise.all([
    repo.listMaterial(project.id),
    repo.listMaterialFiles(project.id),
    repo.listMaterialShareLinks(project.id),
  ]);

  const filesByItem = new Map<string, typeof files>();
  for (const f of files) {
    const list = filesByItem.get(f.itemId);
    if (list) list.push(f);
    else filesByItem.set(f.itemId, [f]);
  }

  const initialStates = states.map((s) => ({
    itemId: s.itemId,
    status: s.status,
    files: (filesByItem.get(s.itemId) ?? []).map((f) => ({
      id: f.id,
      itemId: f.itemId,
      name: f.filename,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.createdAt,
      uploadedByEmail: '',
    })),
  }));

  const initialLinks = links.map((l) => ({
    id: l.id,
    token: l.token,
    createdAt: l.createdAt,
    createdByEmail: '',
    revoked: l.revokedAt != null,
  }));

  return (
    <AppShell
      actor={actor}
      tenant={tenantRef}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: tenantRef.name, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Material' },
      ]}
      fill
    >
      <MaterialScreen
        tenant={tenant}
        projectSlug={project.slug}
        projectName={project.name}
        projectKind={project.kind}
        initialStates={initialStates}
        initialLinks={initialLinks}
        actor={actor}
      />
    </AppShell>
  );
}
