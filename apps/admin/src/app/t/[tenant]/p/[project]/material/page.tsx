import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { MaterialScreen } from '@/components/material/material-screen.tsx';
import { requireAdmin, canEditStructure } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { membership } = await requireAdmin(tenant);
  if (!canEditStructure(membership.role)) redirect(`/t/${tenant}/p/${projectSlug}`);

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
      membership={membership}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: membership.tenantName, href: `/t/${tenant}/p` },
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
      />
    </AppShell>
  );
}
