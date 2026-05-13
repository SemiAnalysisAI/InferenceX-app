/**
 * @file embed-params.ts
 * @description Stable, public-contract URL parameter shape for `/embed/*` routes.
 *
 * The internal app uses `g_*` / `i_*` / `e_*` keys (see `url-state.ts`) which we
 * reserve the right to refactor. The embed surface uses a different, smaller set
 * of keys we commit to keeping working long-term so partner sites can iframe a
 * stable URL contract:
 *
 *   /embed/scatter?model=dsr1&isl=8192&osl=1024&precisions=fp4&gpus=b300_sglang,gb300_dynamo-sglang&y=tpPerGpu&chart=e2e
 *
 * Translation is one-way: embed-shaped params → internal `UrlStateParams`. The
 * translator runs synchronously before provider initializers fire (via
 * `seedUrlState`) so the chart mounts already pointed at the requested state.
 */

import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';
import type { UrlStateParams } from '@/lib/url-state';

/**
 * Default values for embed params. Defaults match the inference page's defaults
 * so a bare `/embed/scatter` URL renders the same default chart users see at
 * `/inference`.
 */
export const EMBED_PARAM_DEFAULTS = {
  model: 'dsr1',
  isl: '8192',
  osl: '1024',
  precisions: 'fp4',
  gpus: '',
  y: 'tpPerGpu',
  chart: 'e2e' as 'e2e' | 'interactivity',
};

export type EmbedParams = typeof EMBED_PARAM_DEFAULTS;

/**
 * Y-axis metric short forms accepted in the embed URL contract. Maps to the
 * internal `y_*` keys used by the chart config. Both the short form (`tpPerGpu`)
 * and the full form (`y_tpPerGpu`) are accepted on input — full form is mainly
 * for forward-compat if we add metrics whose short alias hasn't been picked.
 */
const Y_METRIC_ALIASES: Record<string, string> = {
  tpPerGpu: 'y_tpPerGpu',
  inputTputPerGpu: 'y_inputTputPerGpu',
  outputTputPerGpu: 'y_outputTputPerGpu',
  tpPerMw: 'y_tpPerMw',
  inputTputPerMw: 'y_inputTputPerMw',
  outputTputPerMw: 'y_outputTputPerMw',
  costh: 'y_costh',
  costn: 'y_costn',
  costr: 'y_costr',
  costhOutput: 'y_costhOutput',
  costnOutput: 'y_costnOutput',
  costrOutput: 'y_costrOutput',
  costhi: 'y_costhi',
  costni: 'y_costni',
  costri: 'y_costri',
  jTotal: 'y_jTotal',
  jOutput: 'y_jOutput',
  jInput: 'y_jInput',
};

/**
 * Translate an embed `y` param (short or full form) to the internal `y_*` key.
 * Unknown values fall back to the default.
 */
export function resolveEmbedYMetric(value: string | null | undefined): string {
  if (!value) return Y_METRIC_ALIASES[EMBED_PARAM_DEFAULTS.y]!;
  if (value.startsWith('y_')) return value;
  return Y_METRIC_ALIASES[value] ?? Y_METRIC_ALIASES[EMBED_PARAM_DEFAULTS.y]!;
}

/**
 * Read embed params from a URLSearchParams-compatible source, applying defaults
 * for missing values. Always returns a fully populated object so callers don't
 * have to handle nullables.
 */
export function readEmbedParams(
  source: URLSearchParams | Record<string, string | undefined> | null | undefined,
): EmbedParams {
  const get = (k: string): string | undefined => {
    if (!source) return undefined;
    if (source instanceof URLSearchParams) return source.get(k) ?? undefined;
    return source[k];
  };

  const chartRaw = get('chart');
  const chart: 'e2e' | 'interactivity' = chartRaw === 'interactivity' ? 'interactivity' : 'e2e';

  return {
    model: get('model') || EMBED_PARAM_DEFAULTS.model,
    isl: get('isl') || EMBED_PARAM_DEFAULTS.isl,
    osl: get('osl') || EMBED_PARAM_DEFAULTS.osl,
    precisions: get('precisions') || EMBED_PARAM_DEFAULTS.precisions,
    gpus: get('gpus') ?? EMBED_PARAM_DEFAULTS.gpus,
    y: get('y') || EMBED_PARAM_DEFAULTS.y,
    chart,
  };
}

/**
 * Translate a DB model key (`dsr1`) to the display name (`DeepSeek-R1-0528`)
 * used internally as the `g_model` value. Falls back to the default model when
 * the key is unknown — partner sites with stale model keys still render
 * something instead of an empty page.
 */
export function resolveEmbedModel(dbKey: string): string {
  return (
    DB_MODEL_TO_DISPLAY[dbKey] ??
    DB_MODEL_TO_DISPLAY[EMBED_PARAM_DEFAULTS.model] ??
    'DeepSeek-R1-0528'
  );
}

/**
 * Translate an `isl`/`osl` pair into the internal sequence string (`8k/1k` etc).
 * Falls back to the default sequence when the pair has no known mapping.
 */
export function resolveEmbedSequence(isl: string, osl: string): string {
  const islN = Number.parseInt(isl, 10);
  const oslN = Number.parseInt(osl, 10);
  if (Number.isFinite(islN) && Number.isFinite(oslN)) {
    const seq = islOslToSequence(islN, oslN);
    if (seq) return seq;
  }
  return '8k/1k';
}

/**
 * Translate embed params into the internal `UrlStateParams` shape that the
 * inference providers consume on mount. Pass the result to `seedUrlState`
 * before any provider mounts.
 */
export function embedParamsToUrlState(params: EmbedParams): UrlStateParams {
  const out: UrlStateParams = {
    g_model: resolveEmbedModel(params.model),
    i_seq: resolveEmbedSequence(params.isl, params.osl),
    i_prec: params.precisions,
    i_metric: resolveEmbedYMetric(params.y),
  };
  if (params.gpus) {
    out.i_active = params.gpus;
  }
  return out;
}

/**
 * Build the canonical, internal-route URL that an embed view's attribution
 * link should deep-link to. Mirrors the embed state into the dashboard's
 * `g_*` / `i_*` keys so opening the canonical link reproduces the same chart.
 */
export function buildCanonicalHref(params: EmbedParams, origin: string): string {
  const sp = new URLSearchParams();
  sp.set('g_model', resolveEmbedModel(params.model));
  sp.set('i_seq', resolveEmbedSequence(params.isl, params.osl));
  sp.set('i_prec', params.precisions);
  sp.set('i_metric', resolveEmbedYMetric(params.y));
  if (params.gpus) sp.set('i_active', params.gpus);
  return `${origin}/inference?${sp.toString()}`;
}
