import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EditorScreen } from '@/components/editor/editor-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { isEditableScene } from '@/lib/editor/scene-image.ts';
import { canManageScenes } from '@/lib/roles.ts';

/**
 * Editor de hotspots de una escena.
 *
 * Sale del shell del panel a propósito: ocupa la pantalla entera y fuerza el
 * tema oscuro. Un marco claro alrededor de una panorámica falsea la percepción
 * del color de los polígonos, y lo que se ve mientras se dibuja tiene que ser
 * lo que se publica.
 *
 * Todo se carga en el servidor y baja completo: las unidades del proyecto, sus
 * grupos y los hotspots de TODAS las escenas. Son unos cientos de kilobytes aun
 * en un loteo de 640 lotes, y a cambio el editor no hace un solo viaje de red
 * mientras se dibuja — que es cuando cualquier latencia se nota.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ tenant: string; project: string; scene: string }>;
}) {
  const { tenant, project: projectSlug, scene: sceneSlug } = await params;
  const { actor } = await requireAdmin(tenant);
  // Dibujar hotspots y armar el plano es tarea de Vrotta.
  if (!canManageScenes(actor)) redirect(`/t/${tenant}/p/${projectSlug}`);

  const repo = getRepo();
  const project = await repo.getProject(tenant, projectSlug);
  if (!project) notFound();

  const scenes = await repo.listScenes(project.id);
  const scene = scenes.find((s) => s.slug === sceneSlug || s.id === sceneSlug);
  if (!scene) notFound();

  if (!isEditableScene(scene.kind)) {
    return (
      <main style={{ padding: 24, maxWidth: 520 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{scene.name}</h1>
        <p style={{ color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          Las escenas de tipo <code>{scene.kind}</code> no tienen geometría que dibujar. El editor de hotspots trabaja
          sobre panorámicas y sobre planos.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/t/${tenant}/p/${projectSlug}/scenes`}>← Volver a las escenas</Link>
        </p>
      </main>
    );
  }

  const [units, structure, allHotspots] = await Promise.all([
    repo.getAllUnits(project.id),
    repo.getStructure(project.id),
    repo.listHotspots(project.id),
  ]);

  return (
    <EditorScreen
      tenant={tenant}
      projectSlug={projectSlug}
      projectId={project.id}
      scene={scene}
      units={units}
      groups={structure.groups}
      allHotspots={allHotspots}
    />
  );
}
