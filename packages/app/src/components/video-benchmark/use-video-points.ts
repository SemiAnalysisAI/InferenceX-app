'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { VIDEO_HISTORY_MAX_PAGES, type VideoHistoryPage } from './history';
import { namedRunPoints, videoPoints } from './points';
import type { VideoHistoryData } from './initial-data';

/** Where the named run's overlay comes from; `live` is an unstored run read from GitHub. */
type NamedRunSource = 'none' | 'pending' | 'history' | 'live';

export function useVideoPoints(runId: string | null, initial?: VideoHistoryData | null) {
  const [pages, setPages] = useState<VideoHistoryPage[]>(initial?.pages ?? []);
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replay, setReplay] = useState(initial?.replay ?? false);
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState<{ runId: string; page: VideoHistoryPage | null } | null>(null);
  useEffect(() => {
    if (initial && attempt === 0) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    (async () => {
      const response = await fetch(
        `/api/video-runs?format=history&page=1&pages=${VIDEO_HISTORY_MAX_PAGES}`,
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`Published history HTTP ${response.status}`);
      const data = (await response.json()) as VideoHistoryPage;
      if (data.schemaVersion !== 1 || !Array.isArray(data.entries))
        throw new Error('Unsupported published history projection');
      if (controller.signal.aborted) return;
      setPages([data]);
      setReplay(response.headers.get('x-videogenx-replay') === '1');
    })()
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, initial]);
  const points = useMemo(() => videoPoints(pages), [pages]);
  const storedNamed = useMemo(() => namedRunPoints(pages, runId), [pages, runId]);
  const readLive = !loading && !loadError && storedNamed.length === 0 && runId !== null;
  useEffect(() => {
    if (!readLive || runId === null || live?.runId === runId) return;
    const controller = new AbortController();
    (async () => {
      const response = await fetch(`/api/video-runs?run=${encodeURIComponent(runId)}&format=live`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = response.ok ? ((await response.json()) as VideoHistoryPage) : null;
      return data?.schemaVersion === 1 && Array.isArray(data.entries) ? data : null;
    })()
      .catch(() => null)
      .then((page) => {
        if (!controller.signal.aborted) setLive({ runId, page });
      });
    return () => controller.abort();
  }, [readLive, live?.runId, runId]);
  const livePage = readLive && live?.runId === runId ? live.page : null;
  const namedPoints = useMemo(
    () => (livePage ? namedRunPoints([livePage], runId) : storedNamed),
    [livePage, runId, storedNamed],
  );
  let namedSource: NamedRunSource = 'none';
  if (storedNamed.length > 0) namedSource = 'history';
  else if (runId !== null && (loading || (readLive && live?.runId !== runId)))
    namedSource = 'pending';
  else if (namedPoints.length > 0) namedSource = 'live';
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { points, namedPoints, namedSource, loading, error: loadError, replay, retry };
}
