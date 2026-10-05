'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { VIDEO_HISTORY_MAX_PAGES, type VideoHistoryPage } from './history';
import { videoModelHistory, type VideoModel } from './models';
import { videoPoints } from './points';
import { videoServingEvidence } from './serving-evidence';

/** Load every published history page (bounded) and flatten it into chart points. */
export function useVideoPoints(model: VideoModel = 'h3') {
  const [history, setHistory] = useState<VideoHistoryPage[]>([]);
  const selected = useMemo(() => videoModelHistory(history, model), [history, model]);
  const points = useMemo(() => videoPoints(selected), [selected]);
  const servingEvidence = useMemo(() => videoServingEvidence(selected), [selected]);
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
      for (let page = 1; page <= VIDEO_HISTORY_MAX_PAGES; page++) {
        const response = await fetch(`/api/video-runs?format=history&page=${page}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Published history HTTP ${response.status}`);
        replayed ||= response.headers.has('x-videogenx-replay');
        const data = (await response.json()) as VideoHistoryPage;
        if (data.schemaVersion !== 1 || !Array.isArray(data.entries))
          throw new Error('Unsupported published history projection');
        pages.push(data);
        if (data.nextPage === null) break;
      }
      if (controller.signal.aborted) return;
      setHistory(pages);
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
  return { points, servingEvidence, loading, error: loadError, replay, retry };
}
