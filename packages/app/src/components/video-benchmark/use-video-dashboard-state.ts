import { VIDEO_MODELS } from './models';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_VIDEO_DASHBOARD_STATE,
  readVideoDashboardState,
  writeVideoDashboardState,
  type VideoDashboardState,
} from './video-url-state';

/** Chart/table state read from the URL on load and written back on every change. */
export function useVideoDashboardState() {
  const [state, setState] = useState<VideoDashboardState>(DEFAULT_VIDEO_DASHBOARD_STATE);
  // Next.js patches history.replaceState to update its router, so the URL write
  // must stay out of the setState updater, which React may run during render.
  const latest = useRef(DEFAULT_VIDEO_DASHBOARD_STATE);
  useEffect(() => {
    const initial = readVideoDashboardState(location.search);
    latest.current = initial;
    setState(initial);
  }, []);
  const update = useCallback((patch: Partial<VideoDashboardState>) => {
    const modelChanged = patch.model !== undefined && patch.model !== latest.current.model;
    const next = { ...latest.current, ...patch };
    const url = new URL(location.href);
    if (modelChanged) {
      next.apiPrice = VIDEO_MODELS[next.model].apiReference?.pricePerVideoSecondUsd ?? null;
      next.hidden = [];
      next.qualityThreshold = null;
      next.qualityMetric = 'prompt_adherence';
      if (next.model === 'wan22' && next.y === 'quality') next.y = 'videosPerDollar';
      for (const key of [
        'v_base',
        'v_cand',
        'v_case',
        'history-hardware',
        'history-concurrency',
        'history-query',
      ])
        url.searchParams.delete(key);
    }
    latest.current = next;
    history.replaceState(null, '', writeVideoDashboardState(url, next));
    setState(next);
  }, []);
  return { state, update };
}
