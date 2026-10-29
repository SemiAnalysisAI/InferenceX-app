'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { VIDEO_HISTORY_MAX_PAGES, type VideoHistoryPage } from './history';
import { namedRunPoints, videoPoints } from './points';

/** Read bounded stored history once; derive approved and exact named-run points. */
export function useVideoPoints(runId: string | null) {
  const [pages, setPages] = useState<VideoHistoryPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    (async () => {
      const loadedPages: VideoHistoryPage[] = [];
      let replayed = false;
      for (let page = 1; page <= VIDEO_HISTORY_MAX_PAGES; page++) {
        const response = await fetch(`/api/video-runs?format=history&page=${page}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Published history HTTP ${response.status}`);
        replayed ||= response.headers.get('x-videogenx-replay') === '1';
        const data = (await response.json()) as VideoHistoryPage;
        if (data.schemaVersion !== 1 || !Array.isArray(data.entries))
          throw new Error('Unsupported published history projection');
        loadedPages.push(data);
        if (data.nextPage === null) break;
      }
      if (controller.signal.aborted) return;
      setPages(loadedPages);
      setReplay(replayed);
    })()
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const points = useMemo(() => videoPoints(pages), [pages]);
  const namedPoints = useMemo(() => namedRunPoints(pages, runId), [pages, runId]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { points, namedPoints, loading, error: loadError, replay, retry };
}
