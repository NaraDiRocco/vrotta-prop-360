import type { JobRow, SceneRow } from '../data/types.ts';

export interface ScenesResponse {
  scenes: SceneRow[];
  jobs: JobRow[];
}

export interface CreateSceneRequest {
  slug: string;
  kind: SceneRow['kind'];
  name: string;
  source: Record<string, unknown>;
}

export interface ReorderScenesRequest {
  orderedSceneIds: string[];
}
