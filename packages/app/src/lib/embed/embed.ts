import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { Y_AXIS_METRICS } from '@/lib/charts/chart-utils';
import { toSequence } from '@/lib/compare/compare-enum-coerce';
import { sequenceForScenarioSegment } from '@/lib/compare/compare-scenario-route';
import type { Sequence } from '@/lib/catalog/data-mappings';
import { APP_THEMES, DISABLED_THEMES } from '@/lib/themes/themes';

export {
  EMBED_PATH_PREFIX,
  EMBED_SKIN_HEADER,
  EMBED_THEME_HEADER,
  isEmbedPathname,
} from '@/lib/embed/embed-route';
import { EMBED_SKIN_HEADER, EMBED_THEME_HEADER } from '@/lib/embed/embed-route';

export type EmbedTheme = 'light' | 'dark';

export const EMBED_SKINS = ['vllm'] as const;
export type EmbedSkin = (typeof EMBED_SKINS)[number];

const SKIN_KEYS = new Set<string>(EMBED_SKINS);

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
  frameworks: string[];
  theme: EmbedTheme;
  skin: EmbedSkin | undefined;
  sequence: Sequence | undefined;
  yAxisMetric: string;
}

export const EMBED_DEFAULT_Y_AXIS_METRIC = 'y_tpPerGpu';

const FRAMEWORK_KEYS = new Set<string>(FRAMEWORK_FAMILIES.map((f) => f.key));
const Y_AXIS_METRIC_KEYS = new Set<string>(Y_AXIS_METRICS);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

export function embedBootScript(theme: EmbedTheme, skin: EmbedSkin | undefined): string {
  const skinJs = skin ? JSON.stringify(skin) : 'null';
  return (
    `(function(){var h=document.documentElement;h.dataset.inferencexEmbed='';` +
    `var s=${skinJs};if(s){h.dataset.inferencexSkin=s;}` +
    `h.classList.remove(...${JSON.stringify([...APP_THEMES, ...DISABLED_THEMES])});h.classList.add(${JSON.stringify(theme)});` +
    `h.style.colorScheme=${JSON.stringify(theme)};})();`
  );
}

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
