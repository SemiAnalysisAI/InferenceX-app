'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';
import { videoPoints } from './points';

/** Published pages are read newest first; the frozen campaign fits in far fewer. */
const MAX_PAGES = 5;

/** Load every published history page (bounded) and flatten it into chart points. */
export function useVideoPoints() {
  const [points, setPoints] = useState<VideoPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    (async () => {
      const pages: VideoHistoryPage[] = [];
      let replayed = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await fetch(`/api/video-runs?format=history&page=${page}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Published history HTTP ${response.status}`);
        replayed ||= response.headers.get('x-videogenx-replay') === '1';
        const data = (await response.json()) as VideoHistoryPage;
        if (data.schemaVersion !== 1 || !Array.isArray(data.entries))
          throw new Error('Unsupported published history projection');
        pages.push(data);
        if (data.nextPage === null) break;
      }
      if (controller.signal.aborted) return;
      setPoints(videoPoints(pages));
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
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { points, loading, error: loadError, replay, retry };
}
