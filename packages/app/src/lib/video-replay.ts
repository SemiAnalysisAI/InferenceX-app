import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { StoredArtifact } from '@/components/video-benchmark/stored';

/** Local, retained measurements. The directory is operator-selected, never a URL parameter. */
export async function readVideoReplay(query: URLSearchParams): Promise<Response | null> {
  const directory = process.env.VIDEOGENX_REPLAY_DIR;
  if (process.env.NODE_ENV !== 'development' || !directory) return null;
  const headers = { 'Cache-Control': 'private, no-store', 'X-VideoGenX-Replay': 'retained' };
  const format = query.get('format');
  if (format === 'history') {
    const page = JSON.parse(
      await readFile(resolve(directory, 'history.json'), 'utf8'),
    ) as VideoHistoryPage;
    if (page.schemaVersion !== 1 || !Array.isArray(page.entries) || page.nextPage !== null)
      throw new Error(
        'Invalid retained video history (expected a complete, single-page projection)',
      );
    return Response.json(
      Number(query.get('page') ?? '1') === 1
        ? page
        : { schemaVersion: 1, entries: [], nextPage: null },
      { headers },
    );
  }
  if (format === 'published' || format === 'media') {
    const run = query.get('run');
    const artifact = query.get('artifact');
    if (!run || !artifact || !/^[1-9]\d{0,19}$/u.test(run) || !/^[1-9]\d{0,19}$/u.test(artifact))
      return Response.json(
        { error: 'Invalid retained artifact identity' },
        { status: 400, headers },
      );
    let body: string;
    try {
      body = await readFile(resolve(directory, `${run}.${artifact}.json`), 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return new Response(null, { status: 204, headers });
      throw error;
    }
    const saved = JSON.parse(body) as StoredArtifact;
    if (
      saved.storageVersion !== 1 ||
      saved.runId !== run ||
      saved.artifact.id !== Number(artifact) ||
      !Array.isArray(saved.sources)
    )
      throw new Error('Retained video artifact identity mismatch');
    return Response.json(saved, { headers });
  }
  return null;
}
