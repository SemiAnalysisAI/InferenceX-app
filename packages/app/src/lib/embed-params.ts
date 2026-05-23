/**
 * @file embed-params.ts
 * @description Utilities for building and reading `/embed/*` route URLs.
 *
 * Embed URLs use the same `g_*` / `i_*` parameter keys as the main site
 * (see `url-state.ts`) so there is no translation layer to maintain. The one
 * embed-specific key is `i_chart` (which chart variant to show — the main site
 * renders both E2E and interactivity together, embeds show only one).
 *
 * Example URL:
 *   /embed/scatter?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4
 *     &i_metric=y_tpPerGpu&i_active=b200_sglang,gb300_dynamo-sglang&i_chart=e2e
 */

import { PARAM_DEFAULTS, type UrlStateParams } from '@/lib/url-state';

/**
 * The four core embed-relevant params that must always appear in the canonical
 * `/inference` link, even when not present in the embed URL itself (because
 * the providers will apply these defaults on the client side anyway).
 */
const EMBED_CANONICAL_KEYS = ['g_model', 'i_seq', 'i_prec', 'i_metric'] as const;

/**
 * Read the `i_chart` embed-only param from any string value.
 * Returns `'interactivity'` only for exact match; everything else (including
 * absent/null) defaults to `'e2e'`.
 */
export function readEmbedChartVariant(value: string | null | undefined): 'e2e' | 'interactivity' {
  return value === 'interactivity' ? 'interactivity' : 'e2e';
}

/**
 * Build a stable `/embed/scatter?...` URL from dashboard-style chart state.
 * Emits site-style parameter keys (`g_model`, `i_seq`, `i_prec`, `i_metric`,
 * `i_active`, `i_chart`) so the embed URL and the main site share the same
 * key contract with no translation layer.
 *
 * Note: the embed route does not carry `?unofficialrun=` / overlay data — the
 * URL reflects official benchmark filters only.
 */
export function buildEmbedScatterUrl(args: {
  origin: string;
  /** Display model name (same as `g_model` / UI selection). */
  model: string;
  sequence: string;
  precisions: string;
  yMetric: string;
  activeGpus: string;
  chartType: 'e2e' | 'interactivity';
}): string {
  const baseOrigin = args.origin.replace(/\/$/u, '');
  const precisions = args.precisions.trim() === '' ? 'fp4' : args.precisions;

  const sp = new URLSearchParams();
  sp.set('g_model', args.model);
  sp.set('i_seq', args.sequence);
  sp.set('i_prec', precisions);
  sp.set('i_metric', args.yMetric);
  if (args.activeGpus.trim()) sp.set('i_active', args.activeGpus.trim());
  if (args.chartType === 'interactivity') sp.set('i_chart', 'interactivity');

  return `${baseOrigin}/embed/scatter?${sp.toString()}`;
}

/**
 * Build the canonical `/inference` URL that the embed attribution link
 * should deep-link to. The four core embed params (`g_model`, `i_seq`,
 * `i_prec`, `i_metric`) always appear — using `PARAM_DEFAULTS` as fallback
 * when absent in the embed URL — so a bare `/embed/scatter` produces a
 * fully-specified canonical link. The embed-only `i_chart` key is dropped.
 */
export function buildCanonicalHref(
  params: UrlStateParams & { i_chart?: string },
  origin: string,
): string {
  const sp = new URLSearchParams();

  // Core params: always present (fall back to site defaults when absent).
  for (const k of EMBED_CANONICAL_KEYS) {
    sp.set(k, params[k] ?? PARAM_DEFAULTS[k]);
  }

  // i_active only when explicitly set (empty = all GPUs = no param needed).
  if (params.i_active) sp.set('i_active', params.i_active);

  // Pass through any additional site params the embed URL may carry,
  // skipping keys already handled above and the embed-only i_chart.
  const handled = new Set<string>([...EMBED_CANONICAL_KEYS, 'i_active', 'i_chart']);
  for (const [k, v] of Object.entries(params)) {
    if (handled.has(k) || !v) continue;
    sp.set(k, v);
  }

  return `${origin.replace(/\/$/u, '')}/inference?${sp.toString()}`;
}

const DEFAULT_IFRAME_WIDTH = 800;
const DEFAULT_IFRAME_HEIGHT = 500;

/**
 * Builds a partner-ready `<iframe>` snippet for an embed URL.
 */
export function buildEmbedIframeSnippet(
  src: string,
  options?: { width?: number | string; height?: number },
): string {
  const width = options?.width ?? DEFAULT_IFRAME_WIDTH;
  const height = options?.height ?? DEFAULT_IFRAME_HEIGHT;
  const widthAttr = typeof width === 'number' ? String(width) : width;
  return `<iframe
  src="${src}"
  width="${widthAttr}"
  height="${height}"
  loading="lazy"
  referrerpolicy="origin"
  allow="clipboard-write"
  style="border:none;border-radius:8px">
</iframe>`;
}
