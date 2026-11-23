import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import { benchmarksUrl, DASHBOARD_AVAILABILITY_URL } from '@/lib/api/api';
import { EARLY_FETCH_GLOBAL } from '@/lib/api/early-response';
import type { Model } from '@/lib/catalog/data-mappings';
import { PUBLIC_INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';

/**
 * The latest-rows URL of each public model. Before availability resolves, the Inference chart
 * fetches exactly this URL for its model, and the same key serves the latest run date afterwards.
 */
const LATEST_BENCHMARKS_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  PUBLIC_INFERENCE_MODEL_SLUGS.filter(({ model }) => DISPLAY_MODEL_TO_DB[model]).map(
    ({ model }) => [model, benchmarksUrl(model)],
  ),
);

export interface InferenceEarlyFetch {
  /** Fetch preloads for the document head. They start with the HTML, before any script runs. */
  preloads: string[];
  /** An inline script that hands the requests to `fetchJson` (see `takeEarlyResponse`). */
  script: string;
}

/**
 * The Inference page's first API requests, started during a document load instead of after
 * hydration. `routeModel` is the model the page's path names, or null for the bare route.
 *
 * Availability and the route model's latest rows do not depend on the query string, so they are
 * preloaded. The script claims both. When an explicit `g_model` names another public model (as
 * on the bare route), the script also requests that model's latest rows. It skips them when a
 * pinned `g_rundate` or a favorite `preset` can make the page read other rows. Any other request
 * starts after hydration as before.
 */
export function inferenceEarlyFetch(routeModel: Model | null): InferenceEarlyFetch {
  const routeLatest = routeModel ? LATEST_BENCHMARKS_URLS[routeModel] : undefined;
  const preloads = routeLatest
    ? [DASHBOARD_AVAILABILITY_URL, routeLatest]
    : [DASHBOARD_AVAILABILITY_URL];
  const config = JSON.stringify({
    preloads,
    latest: LATEST_BENCHMARKS_URLS,
    model: routeModel,
  }).replaceAll('<', String.raw`\u003c`);
  const script = [
    '(function(c){try{',
    `var r=window.${EARLY_FETCH_GLOBAL}=window.${EARLY_FETCH_GLOBAL}||{};`,
    'function f(u){var p=fetch(u);p.catch(function(){});r[u]={startedAt:performance.now(),response:p}}',
    'c.preloads.forEach(f);',
    'var q=new URLSearchParams(location.search),m=q.get("g_model");',
    'if(m&&m!==c.model&&!q.has("g_rundate")&&!q.has("preset")&&Object.prototype.hasOwnProperty.call(c.latest,m))f(c.latest[m])',
    `}catch(e){}})(${config})`,
  ].join('');
  return { preloads, script };
}
