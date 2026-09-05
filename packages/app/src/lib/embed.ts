import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { Y_AXIS_METRICS } from '@/lib/chart-utils';
import { toSequence } from '@/lib/compare-enum-coerce';
import { sequenceForScenarioSegment } from '@/lib/compare-scenario-route';
import type { Sequence } from '@/lib/data-mappings';

export {
  EMBED_PATH_PREFIX,
  EMBED_SKIN_HEADER,
  EMBED_THEME_HEADER,
  isEmbedPathname,
} from '@/lib/embed-route';
import { EMBED_SKIN_HEADER, EMBED_THEME_HEADER } from '@/lib/embed-route';

export type EmbedTheme = 'light' | 'dark';

/**
 * Host-site skins. A skin re-tokens the embed (colors, radius, fonts) so the
 * chart sits inside the host's page instead of looking like a screenshot of
 * InferenceX. Each skin has a light and a dark variant selected by the theme;
 * the CSS lives in `globals.css` under `html[data-inferencex-skin='<skin>']`.
 */
export const EMBED_SKINS = ['vllm'] as const;
export type EmbedSkin = (typeof EMBED_SKINS)[number];

const SKIN_KEYS = new Set<string>(EMBED_SKINS);

/**
 * Split a `theme=` value into base theme + optional skin. Accepts `light`,
 * `dark`, `<skin>-light`, `<skin>-dark`. Anything else is the dark default.
 */
export function parseEmbedTheme(raw: string | undefined): {
  theme: EmbedTheme;
  skin: EmbedSkin | undefined;
} {
  const value = raw?.trim().toLowerCase() ?? '';
  const dash = value.lastIndexOf('-');
  const base = dash === -1 ? value : value.slice(dash + 1);
  const prefix = dash === -1 ? '' : value.slice(0, dash);
  const theme: EmbedTheme = base === 'light' ? 'light' : 'dark';
  const skin = SKIN_KEYS.has(prefix) ? (prefix as EmbedSkin) : undefined;
  return { theme, skin };
}

export interface EmbedOptions {
  /**
   * Serving-framework families the chart is locked to (quick-filter keys:
   * `vllm`, `sglang`, `trt`, `atom`). Empty = every framework. A locked embed
   * never shows other engines — not in the plot, the legend, or the filter
   * dialog — so a host site can scope the chart to the engine it documents.
   */
  frameworks: string[];
  theme: EmbedTheme;
  /** Host-site skin; `undefined` renders InferenceX's own look. */
  skin: EmbedSkin | undefined;
  /** Workload override; `undefined` keeps the model's featured scenario. */
  sequence: Sequence | undefined;
  /**
   * Y-axis metric. Defaults to {@link EMBED_DEFAULT_Y_AXIS_METRIC} (total
   * token throughput per chip) rather than the dashboard's $/TCO default,
   * because host sites want the raw hardware number without InferenceX's
   * cost-tier assumptions.
   */
  yAxisMetric: string;
}

/** `y_tpPerGpu`: total token throughput per chip (tok/s/chip). */
export const EMBED_DEFAULT_Y_AXIS_METRIC = 'y_tpPerGpu';

const FRAMEWORK_KEYS = new Set<string>(FRAMEWORK_FAMILIES.map((f) => f.key));
const Y_AXIS_METRIC_KEYS = new Set<string>(Y_AXIS_METRICS);

/** Flatten a Next.js `searchParams` value to its first string. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse the embed query string. Unknown values fall back to defaults rather
 * than 404ing — an embed is authored once and pasted many times, so a typo
 * should degrade to the unfiltered chart, not a blank frame.
 *
 * - `framework=vllm` or `framework=vllm,sglang` (also accepts `fw=`)
 * - `theme=light|dark|vllm-light|vllm-dark` (default dark, matching the site;
 *   the `<skin>-` prefix re-tokens the embed to match the host site). `skin=`
 *   is also accepted on its own.
 * - `scenario=agentic|8k-1k|1k-1k|1k-8k` (also accepts raw `i_seq=` keys)
 * - `metric=<y-axis metric key>` (e.g. `y_tokensPerDollarH`)
 */
export function parseEmbedOptions(
  searchParams: Record<string, string | string[] | undefined>,
): EmbedOptions {
  const rawFrameworks = first(searchParams.framework) ?? first(searchParams.fw) ?? '';
  const frameworks = [
    ...new Set(
      rawFrameworks
        .split(',')
        .map((f) => f.trim().toLowerCase())
        .filter((f) => FRAMEWORK_KEYS.has(f)),
    ),
  ];

  const parsedTheme = parseEmbedTheme(first(searchParams.theme));
  const theme = parsedTheme.theme;
  const rawSkin = first(searchParams.skin)?.trim().toLowerCase();
  const skin =
    parsedTheme.skin ?? (rawSkin && SKIN_KEYS.has(rawSkin) ? (rawSkin as EmbedSkin) : undefined);

  const rawScenario = first(searchParams.scenario) ?? first(searchParams.i_seq);
  const sequence = rawScenario
    ? (sequenceForScenarioSegment(rawScenario) ?? toSequence(rawScenario))
    : undefined;

  const rawMetric = first(searchParams.metric) ?? first(searchParams.i_metric);
  const yAxisMetric =
    rawMetric && Y_AXIS_METRIC_KEYS.has(rawMetric) ? rawMetric : EMBED_DEFAULT_Y_AXIS_METRIC;

  return { frameworks, theme, skin, sequence, yAxisMetric };
}

/**
 * `postMessage` contract between the embed and its host page. The embed posts
 * its rendered height whenever it changes so the host can size the iframe
 * without a scrollbar; the host is expected to check `event.origin`.
 */
export const EMBED_RESIZE_MESSAGE_TYPE = 'inferencex:embed-resize';

export interface EmbedResizeMessage {
  type: typeof EMBED_RESIZE_MESSAGE_TYPE;
  height: number;
}

export function isEmbedResizeMessage(data: unknown): data is EmbedResizeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === EMBED_RESIZE_MESSAGE_TYPE &&
    typeof (data as { height?: unknown }).height === 'number' &&
    Number.isFinite((data as { height: number }).height)
  );
}

/**
 * Inline script that stamps the embed theme/skin on <html> before first
 * paint. Rendered by the embed layouts (from the `x-inferencex-embed-theme`
 * header the proxy forwards) so it runs ahead of `next-themes`; EmbedFrame
 * re-applies the same state from React for client navigations.
 * Values are validated enums, so interpolating them into JS is safe.
 */
export function embedBootScript(theme: EmbedTheme, skin: EmbedSkin | undefined): string {
  const skinJs = skin ? JSON.stringify(skin) : 'null';
  return (
    `(function(){var h=document.documentElement;h.dataset.inferencexEmbed='';` +
    `var s=${skinJs};if(s){h.dataset.inferencexSkin=s;}` +
    `h.classList.remove('light','dark','minecraft');h.classList.add(${JSON.stringify(theme)});` +
    `h.style.colorScheme=${JSON.stringify(theme)};})();`
  );
}

/** Resolve theme + skin from the proxy-forwarded headers (same rules as `parseEmbedOptions`). */
export function embedThemeFromHeaders(get: (name: string) => string | null | undefined): {
  theme: EmbedTheme;
  skin: EmbedSkin | undefined;
} {
  const parsed = parseEmbedTheme(get(EMBED_THEME_HEADER) ?? undefined);
  const rawSkin = get(EMBED_SKIN_HEADER)?.trim().toLowerCase();
  const skin =
    parsed.skin ?? (rawSkin && SKIN_KEYS.has(rawSkin) ? (rawSkin as EmbedSkin) : undefined);
  return { theme: parsed.theme, skin };
}
