'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { JobRow, SceneRow } from '@/lib/data/types.ts';
import type { ScenesResponse } from '@/lib/scenes/api-types.ts';
import { JobQueue } from './job-queue.tsx';
import { SceneCard } from './scene-card.tsx';
import { UploadZone, type AcceptedUpload } from './upload-zone.tsx';

export function ScenesScreen({
  tenant,
  projectSlug,
  projectId,
  initialScenes,
  initialJobs,
}: {
  tenant: string;
  projectSlug: string;
  projectId: string;
  initialScenes: SceneRow[];
  initialJobs: JobRow[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ['scenes', projectId] as const;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [logJob, setLogJob] = useState<JobRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data } = useQuery<ScenesResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/p/${projectId}/scenes`);
      if (!res.ok) throw new Error('No pude cargar las escenas');
      return (await res.json()) as ScenesResponse;
    },
    initialData: { scenes: initialScenes, jobs: initialJobs },
    // La cola de procesamiento cambia sola (jobs corriendo en el worker):
    // refresco corto mientras haya algo activo.
    refetchInterval: (q) => {
      const jobs = q.state.data?.jobs ?? [];
      return jobs.some((j) => j.status === 'queued' || j.status === 'running') ? 3000 : false;
    },
  });

  const scenes = [...(data?.scenes ?? [])].sort((a, b) => a.sort - b.sort);
  const jobs = data?.jobs ?? [];
  const jobBySceneId = new Map(jobs.filter((j) => j.sceneId).map((j) => [j.sceneId as string, j]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const withPending = async (id: string, fn: () => Promise<void>) => {
    setPending((prev) => new Set(prev).add(id));
    try {
      await fn();
      await invalidate();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (upload: AcceptedUpload) => {
      const res = await fetch(`/api/p/${projectId}/scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upload),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo crear la escena');
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedSceneIds: string[]) => {
      await fetch(`/api/p/${projectId}/scenes/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedSceneIds }),
      });
    },
    onSuccess: () => invalidate(),
  });

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = scenes.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setDragId(null);
    reorderMutation.mutate(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <JobQueue
        jobs={jobs}
        pending={pending}
        onRetry={(jobId) => withPending(jobId, async () => {
          await fetch(`/api/p/${projectId}/scenes/jobs/${jobId}/retry`, { method: 'POST' });
        })}
        onCancel={(jobId) => withPending(jobId, async () => {
          await fetch(`/api/p/${projectId}/scenes/jobs/${jobId}/cancel`, { method: 'POST' });
        })}
        onViewLog={setLogJob}
      />

      <UploadZone disabled={uploadMutation.isPending} onAccepted={(upload) => uploadMutation.mutate(upload)} />

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {scenes.length === 0 ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Todavía no hay escenas. Subí un panorama, plano, mapa o video arriba.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                job={jobBySceneId.get(scene.id)}
                editHref={`/t/${tenant}/p/${projectSlug}/scenes/${scene.id}/edit`}
                draggable
                dragging={dragId === scene.id}
                onDragStart={() => setDragId(scene.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(scene.id)}
                onSetInitial={() =>
                  withPending(scene.id, async () => {
                    await fetch(`/api/p/${projectId}/scenes/${scene.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ isInitial: true }),
                    });
                  })
                }
                onRename={(name) =>
                  withPending(scene.id, async () => {
                    await fetch(`/api/p/${projectId}/scenes/${scene.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name }),
                    });
                  })
                }
                onDelete={() =>
                  withPending(scene.id, async () => {
                    await fetch(`/api/p/${projectId}/scenes/${scene.id}`, { method: 'DELETE' });
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {logJob && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setLogJob(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, width: 480, maxWidth: '90vw' }}
          >
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Log · {logJob.sceneName ?? logJob.id}</h2>
            <pre
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 10,
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
              {[
                `job ${logJob.id}`,
                `kind: ${logJob.kind}`,
                `status: ${logJob.status}`,
                `progress: ${logJob.progress}%`,
                logJob.etaS !== null ? `eta: ${logJob.etaS}s` : null,
                `created_at: ${logJob.createdAt}`,
                `updated_at: ${logJob.updatedAt}`,
                logJob.error ? `error: ${logJob.error}` : null,
              ]
                .filter(Boolean)
                .join('\n')}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="r-btn" onClick={() => setLogJob(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
