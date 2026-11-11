import { NextRequest } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { GET as videoRuns } from '@/app/api/video-runs/route';
import {
  VIDEO_HISTORY_MAX_PAGES,
  type VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { videoPoints } from '@/components/video-benchmark/points';
import {
  referencePsnrScores,
  type ReferencePsnrScores,
} from '@/components/video-benchmark/quality-method';
import { publishedResultsSide } from '@/components/video-benchmark/results-clips';
import type { StoredArtifact } from '@/components/video-benchmark/stored';

/** The run the quality guide plots: lossless SGLang on B200 and H100, four GPUs each. */
export const REFERENCE_PSNR_RUN_ID = '41280191475';

export interface ReferencePsnrEvidence {
  runId: string;
  /** Null when a published read failed or the run has no scored lossless clip. */
  hardware: ReferencePsnrScores[] | null;
}

/** The same read-only transport the dashboard uses, in process. */
function videoRunsRead(params: Record<string, string>) {
  const url = new URL('/api/video-runs', SITE_URL);
  url.search = new URLSearchParams(params).toString();
  return videoRuns(new NextRequest(url));
}

/**
 * Every History page, read until `nextPage` runs out, keeping only `runId`'s entries. The pinned
 * run ages out of the dashboard's newest-first window, so the guide cannot read just that window.
 */
async function runHistory(runId: string): Promise<VideoHistoryPage | null> {
  const entries: VideoHistoryPage['entries'] = [];
  for (let page: number | null = 1; page !== null;) {
    const response = await videoRunsRead({
      format: 'history',
      page: String(page),
      pages: String(VIDEO_HISTORY_MAX_PAGES),
    });
    if (!response.ok || response.headers.get('x-videogenx-incomplete') === '1') return null;
    const history: VideoHistoryPage = await response.json();
    if (history.schemaVersion !== 1 || !Array.isArray(history.entries)) return null;
    entries.push(...history.entries.filter((entry) => entry.runId === runId));
    page = history.nextPage !== null && history.nextPage > page ? history.nextPage : null;
  }
  return { schemaVersion: 1, entries, nextPage: null };
}

async function readScores(runId: string): Promise<ReferencePsnrScores[] | null> {
  const history = await runHistory(runId);
  if (!history) return null;
  const points = videoPoints([history]);
  const artifacts = new Map<number, Promise<StoredArtifact>>();
  const leads = await Promise.all(
    points.map(async (point) => {
      let artifact = artifacts.get(point.artifactId);
      if (!artifact) {
        artifact = videoRunsRead({
          format: 'published',
          run: runId,
          artifact: String(point.artifactId),
        }).then((response) => {
          if (response.status !== 200) throw new Error('Published result unavailable');
          return response.json() as Promise<StoredArtifact>;
        });
        artifacts.set(point.artifactId, artifact);
      }
      return { point, side: publishedResultsSide(await artifact, point) };
    }),
  );
  const scored = referencePsnrScores(leads);
  return scored.length > 0 ? scored : null;
}

/**
 * The pinned run's published reference PSNR, per hardware, read on the server so the page ships
 * the scores instead of the published results they come from.
 */
export async function loadReferencePsnrEvidence(): Promise<ReferencePsnrEvidence> {
  try {
    return { runId: REFERENCE_PSNR_RUN_ID, hardware: await readScores(REFERENCE_PSNR_RUN_ID) };
  } catch (error) {
    // Let Next see a dynamic read during prerender instead of baking in the unavailable state.
    unstable_rethrow(error);
    return { runId: REFERENCE_PSNR_RUN_ID, hardware: null };
  }
}
