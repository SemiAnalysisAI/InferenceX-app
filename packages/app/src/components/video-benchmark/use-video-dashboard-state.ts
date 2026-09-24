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
    const next = { ...latest.current, ...patch };
    latest.current = next;
    history.replaceState(null, '', writeVideoDashboardState(new URL(location.href), next));
    setState(next);
  }, []);
  return { state, update };
}
