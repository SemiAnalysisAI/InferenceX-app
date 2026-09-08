import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GithubWorkflowRun } from './github-artifacts';

export interface LocalArtifactPreview {
  run: GithubWorkflowRun;
  benchmarks: Record<string, unknown>[];
  evaluations: Record<string, unknown>[];
}

/** An explicit local fixture directory, never a private-repository API fallback. */
export function localArtifactPreviewEnabled(hostname: string): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname) &&
    Boolean(process.env.INFERENCEX_LOCAL_ARTIFACT_DIR)
  );
}

export async function readLocalArtifactPreview(
  runId: string,
): Promise<LocalArtifactPreview | null> {
  const directory = process.env.INFERENCEX_LOCAL_ARTIFACT_DIR;
  if (process.env.NODE_ENV !== 'development' || !directory || !/^\d+$/u.test(runId)) return null;
  try {
    const value: LocalArtifactPreview = JSON.parse(
      await readFile(join(directory, `${runId}.json`), 'utf8'),
    );
    if (
      String(value.run?.id) !== runId ||
      !Array.isArray(value.benchmarks) ||
      !Array.isArray(value.evaluations)
    ) {
      throw new Error('Invalid local artifact preview');
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
