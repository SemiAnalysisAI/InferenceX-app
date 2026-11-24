'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { VIDEO_HISTORY_MAX_PAGES, type VideoHistoryPage } from './history';
import { videoPoints } from './points';
import { cachedNamedVideoRun, resolveNamedVideoRun, type NamedVideoRun } from './named-run';
import type { VideoHistoryData } from './initial-data';

const EMPTY_POINTS: NamedVideoRun['points'] = [];

/**
 * `pending` means the server is still streaming the cohort for this render, so
 * the browser shows the loading state without starting its own read.
 */
export function useVideoPoints(
  runId: string | null,
  initial?: VideoHistoryData | null,
  pending = false,
) {
  const [pages, setPages] = useState<VideoHistoryPage[]>(initial?.pages ?? []);
  const [loading, setLoading] = useState(pending || !initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replay, setReplay] = useState(initial?.replay ?? false);
  const [attempt, setAttempt] = useState(0);
  const [namedAttempt, setNamedAttempt] = useState(0);
  const [resolved, setResolved] = useState<{ key: string; run: NamedVideoRun } | null>(null);
  useEffect(() => {
    if (pending || (initial && attempt === 0)) return;
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
      // Entries whose index or approval read failed are missing or unapproved; keep what
      // arrived and leave the retry offered.
      if (response.headers.get('x-videogenx-incomplete') === '1')
        throw new Error('Published history incomplete');
    })()
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, initial, pending]);
  const points = useMemo(() => videoPoints(pages), [pages]);
  const cached = useMemo(() => {
    if (!runId) return null;
    const local = cachedNamedVideoRun(pages, runId, loadError === null);
    return local?.source === 'incomplete' && !loadError ? null : local;
  }, [loadError, pages, runId]);
  if (resolved && resolved.run.runId !== runId) setResolved(null);
  const key = JSON.stringify([runId, attempt, namedAttempt]);
  useEffect(() => {
    if (!runId || loading || loadError || cached) return;
    const controller = new AbortController();
    void resolveNamedVideoRun(pages, runId, (params) =>
      fetch(`/api/video-runs?${new URLSearchParams(params)}`, {
        signal: controller.signal,
        cache: 'no-store',
      }),
    ).then((run) => {
      if (!controller.signal.aborted) setResolved({ key, run });
    });
    return () => controller.abort();
  }, [runId, key, cached, loadError, loading, pages]);
  const named = cached ?? (resolved?.key === key ? resolved.run : null);
  const namedSource = named?.source ?? (runId ? 'pending' : 'none');
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const retryNamed = useCallback(() => setNamedAttempt((n) => n + 1), []);
  return {
    points,
    namedPoints: named?.points ?? EMPTY_POINTS,
    namedSource,
    loading,
    error: loadError,
    replay,
    retry,
    retryNamed: loadError ? retry : retryNamed,
  };
}
