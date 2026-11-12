import { NextRequest } from 'next/server';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { GET as videoRuns } from '@/app/api/video-runs/route';
import {
  VIDEO_HISTORY_MAX_PAGES,
  type VideoHistoryPage,
} from '@/components/video-benchmark/history';
import {
  videoClipSourceKey,
  type VideoInitialData,
} from '@/components/video-benchmark/initial-data';
import { namedRunPoints, videoPoints } from '@/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '@/components/video-benchmark/results';
import { chartedCells, stageOpenings } from '@/components/video-benchmark/results-chart';
import {
  publishedResultsSide,
  resultsClipPoints,
} from '@/components/video-benchmark/results-clips';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { videoStorageEnabled } from './video-storage';

export type VideoPageSearchParams = Record<string, string | string[] | undefined>;

function request(params: Record<string, string>) {
  const url = new URL('/api/video-runs', SITE_URL);
  url.search = new URLSearchParams(params).toString();
  return videoRuns(new NextRequest(url));
}

/** The URL-selected results state, which the shell can render before any data is read. */
export function videoPageState(params: VideoPageSearchParams) {
  const search = new URLSearchParams();
  for (const [key, values] of Object.entries(params))
    for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values])
      search.append(key, value);
  return parseResultsState(search.toString());
}

/** Reuse the read-only transport in process, including its replay gate. */
export async function loadVideoPageData(params: VideoPageSearchParams): Promise<VideoInitialData> {
  const state = videoPageState(params);
  const initial: VideoInitialData = { state, history: null, sides: {} };
  // A seed stops the client read, and without storage the transport has only an empty
  // History; local fixture and replay data reach the browser through that client read.
  if (!videoStorageEnabled()) return initial;

  try {
    const historyResponse = await request({
      format: 'history',
      page: '1',
      pages: String(VIDEO_HISTORY_MAX_PAGES),
    });
    if (!historyResponse.ok) throw new Error('Published history unavailable');
    // The shared cache serves a degraded read without retaining it; a seed would retain it
    // for this document and stop the browser's own read.
    if (historyResponse.headers.get('x-videogenx-incomplete') === '1')
      throw new Error('Published history incomplete');
    const data: VideoHistoryPage = await historyResponse.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.entries))
      throw new Error('Unsupported published history projection');
    const pages = [data];
    initial.history = { pages, replay: historyResponse.headers.get('x-videogenx-replay') === '1' };
    const projection = resultProjection(
      videoPoints(pages),
      state,
      namedRunPoints(pages, state.unofficialRun),
    );
    const leads = resultsClipPoints(chartedCells(projection, state), { tier: state.costTier });
    // The stage opens on its own deployment, which the first render must not fetch again.
    const points = [...new Set([...leads, ...stageOpenings(projection, state, leads)])];
    const artifacts = new Map<string, Promise<StoredArtifact | null>>();
    const sides = await Promise.allSettled(
      points.map(async (point) => {
        const key = `${point.runId}:${point.artifactId}`;
        let artifact = artifacts.get(key);
        if (!artifact) {
          artifact = request({
            format: 'published',
            run: point.runId,
            artifact: String(point.artifactId),
          }).then(async (response): Promise<StoredArtifact | null> => {
            if (response.status === 204) return null;
            if (!response.ok) throw new Error('Published media unavailable');
            const saved: StoredArtifact = await response.json();
            return saved;
          });
          artifacts.set(key, artifact);
        }
        const saved = await artifact;
        return [
          videoClipSourceKey(point),
          saved ? publishedResultsSide(saved, point) : null,
        ] as const;
      }),
    );
    initial.sides = Object.fromEntries(
      sides.flatMap((side) => (side.status === 'fulfilled' ? [side.value] : [])),
    );
  } catch {
    // Keep the page's existing client retry path available when its initial read fails.
  }
  return initial;
}
