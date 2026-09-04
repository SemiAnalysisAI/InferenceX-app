/**
 * Fetch hooks for the InferenceX views API.
 *
 * Two flavors:
 *   1. SWR hooks (recommended): `npm i swr`
 *   2. Zero-dependency `useView` fallback (plain fetch + useEffect)
 *
 * The views API is public GET, CDN-cached — no auth, no API key.
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type {
  HistoricalViewResponse,
  InferenceViewResponse,
  RankingsViewResponse,
  ViewOptionsResponse,
} from './types';

export const INFERENCEX_BASE = 'https://inferencex.semianalysis.com';

export type ViewParams = Record<string, string | number | boolean | undefined>;

/** Build the /api/v1/views/<name> URL with query params (undefined values skipped). */
export function viewUrl(name: string, params: ViewParams = {}): string {
  const url = new URL(`${INFERENCEX_BASE}/api/v1/views/${name}`);
  // Sort keys so logically identical requests share one URL (mirrors server cache keying).
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Envelope-aware fetcher: surfaces { error, allowed } bodies as Error messages. */
export async function fetchView<T>(name: string, params: ViewParams = {}): Promise<T> {
  const res = await fetch(viewUrl(name, params));
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; allowed?: string[] };
    const allowed = body.allowed ? ` (allowed: ${body.allowed.join(', ')})` : '';
    throw new Error(body.error ? `${body.error}${allowed}` : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const swrOptions = {
  revalidateOnFocus: false,
  dedupingInterval: 60_000, // responses are CDN-cached; no need to refetch aggressively
};

/* ---------------- SWR hooks ---------------- */

/** Option domains for building controls (models, metrics, hardware, defaults, ...). */
export function useViewOptions() {
  return useSWR<ViewOptionsResponse>(
    viewUrl('options'),
    (url: string) => fetch(url).then((r) => r.json()),
    swrOptions,
  );
}

/** Chart-ready inference scatter series. `model` is required by the API. */
export function useInferenceView(params: ViewParams & { model: string }) {
  return useSWR<InferenceViewResponse>(
    viewUrl('inference', params),
    () => fetchView<InferenceViewResponse>('inference', params),
    swrOptions,
  );
}

/** Interpolated trend lines at a target interactivity (default 35 tok/s/user). */
export function useHistoricalView(params: ViewParams & { model: string }) {
  return useSWR<HistoricalViewResponse>(
    viewUrl('historical', params),
    () => fetchView<HistoricalViewResponse>('historical', params),
    swrOptions,
  );
}

/** Fastest/cheapest GPU ranking tables. */
export function useRankingsView(params: ViewParams = {}) {
  return useSWR<RankingsViewResponse>(
    viewUrl('rankings', params),
    () => fetchView<RankingsViewResponse>('rankings', params),
    swrOptions,
  );
}

/* ---------------- Zero-dependency fallback ---------------- */

export interface ViewState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/** Plain fetch + useEffect hook — use when you don't want the swr dependency. */
export function useView<T>(name: string, params: ViewParams = {}): ViewState<T> {
  const url = viewUrl(name, params);
  const [state, setState] = useState<ViewState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<T>;
      })
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: Error) => !cancelled && setState({ data: null, error, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
