import type { VideoPoint } from './metrics';
import type { StoredArtifact } from './stored';

/**
 * The stored artifact of a point, or the live read of an unstored named run. Null when neither
 * holds it; throws when the read fails.
 */
export async function readPointArtifact(
  point: Pick<VideoPoint, 'runId' | 'artifactId'>,
  unofficialRun: string | null | undefined,
  signal: AbortSignal,
): Promise<StoredArtifact | null> {
  const read = (format: 'published' | 'live') =>
    fetch(
      `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=${format}`,
      { signal },
    );
  let response = await read('published');
  // An unstored named run has documents without media.
  if (response.status === 204 && point.runId === unofficialRun) response = await read('live');
  if (response.status === 204) return null;
  if (!response.ok) throw new Error('Published artifact read failed');
  return (await response.json()) as StoredArtifact;
}
