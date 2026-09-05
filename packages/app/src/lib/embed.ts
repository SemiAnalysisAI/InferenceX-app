import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { Y_AXIS_METRICS } from '@/lib/chart-utils';
import { toSequence } from '@/lib/compare-enum-coerce';
import { sequenceForScenarioSegment } from '@/lib/compare-scenario-route';
import type { Sequence } from '@/lib/data-mappings';

export { EMBED_PATH_PREFIX, isEmbedPathname } from '@/lib/embed-route';

export type EmbedTheme = 'light' | 'dark';

export interface EmbedOptions {
  /**
   * Serving-framework families the chart is locked to (quick-filter keys:
   * `vllm`, `sglang`, `trt`, `atom`). Empty = every framework. A locked embed
   * never shows other engines — not in the plot, the legend, or the filter
   * dialog — so a host site can scope the chart to the engine it documents.
   */
  frameworks: string[];
  theme: EmbedTheme;
  /** Workload override; `undefined` keeps the model's featured scenario. */
  sequence: Sequence | undefined;
  /** Y-axis metric override; `undefined` keeps the dashboard default. */
  yAxisMetric: string | undefined;
}

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
 * - `theme=light|dark` (default dark, matching the site)
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

  const rawTheme = first(searchParams.theme)?.toLowerCase();
  const theme: EmbedTheme = rawTheme === 'light' ? 'light' : 'dark';

  const rawScenario = first(searchParams.scenario) ?? first(searchParams.i_seq);
  const sequence = rawScenario
    ? (sequenceForScenarioSegment(rawScenario) ?? toSequence(rawScenario))
    : undefined;

  const rawMetric = first(searchParams.metric) ?? first(searchParams.i_metric);
  const yAxisMetric = rawMetric && Y_AXIS_METRIC_KEYS.has(rawMetric) ? rawMetric : undefined;

  return { frameworks, theme, sequence, yAxisMetric };
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
