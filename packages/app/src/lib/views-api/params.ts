import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import {
  DEFAULT_METRIC_CONFIG_KEY,
  isMetricKey,
  type MetricConfigKey,
} from '@/components/inference/metric-registry';
import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { PRECISION_OPTIONS, Sequence, type Precision } from '@/lib/data-mappings';

import { ViewsApiParamError } from './errors';

/**
 * Shared query-parameter parsing for the read-only views API.
 *
 * Conventions:
 * - Unknown enum values are a 400 (`ViewsApiParamError` with the allowed list),
 *   never a silent fallback — API consumers must find typos immediately.
 * - List parameters are comma-separated, trimmed, deduplicated, and returned in
 *   a canonical (sorted) order so logically identical requests share cache keys.
 * - Model accepts the dashboard display name (case-insensitive) plus the
 *   public compare-page slugs and their aliases (e.g. `deepseek-v4`).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export interface ResolvedModel {
  /** Canonical display name, e.g. `DeepSeek-V4-Pro`. */
  readonly displayName: string;
  /** DB model keys behind the display name. */
  readonly dbModelKeys: readonly string[];
}

const DISPLAY_NAMES = Object.keys(DISPLAY_MODEL_TO_DB);
const LOWERCASE_DISPLAY_TO_CANONICAL = new Map(
  DISPLAY_NAMES.map((name) => [name.toLowerCase(), name]),
);
const SLUG_TO_DISPLAY = new Map(
  COMPARE_MODEL_SLUGS.map((entry) => [entry.slug, entry.displayName]),
);

/** Canonical model-name vocabulary accepted by `model=` (display names). */
export const VIEWS_MODEL_NAMES: readonly string[] = DISPLAY_NAMES.toSorted();

export function resolveModelParam(value: string | null, param = 'model'): ResolvedModel {
  if (!value) {
    throw new ViewsApiParamError(param, `${param} is required`, VIEWS_MODEL_NAMES);
  }
  const displayFromName = LOWERCASE_DISPLAY_TO_CANONICAL.get(value.toLowerCase());
  const slug = COMPARE_MODEL_ALIASES[value.toLowerCase()] ?? value.toLowerCase();
  const displayName = displayFromName ?? SLUG_TO_DISPLAY.get(slug);
  const dbModelKeys = displayName ? DISPLAY_MODEL_TO_DB[displayName] : undefined;
  if (!displayName || !dbModelKeys || dbModelKeys.length === 0) {
    throw new ViewsApiParamError(param, `Unknown model: ${value}`, VIEWS_MODEL_NAMES);
  }
  return { displayName, dbModelKeys };
}

const SEQUENCE_ALIASES: Readonly<Record<string, Sequence>> = {
  '1k/1k': Sequence.OneK_OneK,
  '1k-1k': Sequence.OneK_OneK,
  '1k/8k': Sequence.OneK_EightK,
  '1k-8k': Sequence.OneK_EightK,
  '8k/1k': Sequence.EightK_OneK,
  '8k-1k': Sequence.EightK_OneK,
  'agentic-traces': Sequence.AgenticTraces,
  agentic_traces: Sequence.AgenticTraces,
  agentic: Sequence.AgenticTraces,
};

export const VIEWS_SEQUENCE_VALUES: readonly string[] = [
  '1k/1k',
  '1k/8k',
  '8k/1k',
  'agentic-traces',
];

export function parseSequenceParam(
  value: string | null,
  fallback: Sequence,
  param = 'sequence',
): Sequence {
  if (!value) return fallback;
  const sequence = SEQUENCE_ALIASES[value.toLowerCase()];
  if (!sequence) {
    throw new ViewsApiParamError(param, `Unknown sequence: ${value}`, VIEWS_SEQUENCE_VALUES);
  }
  return sequence;
}

export function parseEnumParam<T extends string>(
  value: string | null,
  param: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  const lowered = value.toLowerCase();
  const match = allowed.find((candidate) => candidate.toLowerCase() === lowered);
  if (match) return match;
  throw new ViewsApiParamError(param, `Unknown ${param}: ${value}`, allowed);
}

/** Comma list restricted to `allowed`; returns canonical sorted unique values. */
export function parseListParam<T extends string>(
  value: string | null,
  param: string,
  allowed: readonly T[],
): T[] {
  if (!value) return [];
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const resolved = items.map((item) => {
    const lowered = item.toLowerCase();
    const match = allowed.find((candidate) => candidate.toLowerCase() === lowered);
    if (!match) {
      throw new ViewsApiParamError(param, `Unknown ${param} entry: ${item}`, allowed);
    }
    return match;
  });
  return [...new Set(resolved)].toSorted();
}

/** Free-form comma list (e.g. hardware keys); canonical sorted unique values. */
export function parseFreeListParam(value: string | null): string[] {
  if (!value) return [];
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(items)].toSorted();
}

export function parsePrecisionsParam(value: string | null, param = 'precisions'): Precision[] {
  return parseListParam(value, param, PRECISION_OPTIONS);
}

export function parseBoolParam(value: string | null, param: string, fallback: boolean): boolean {
  if (value === null || value === '') return fallback;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  throw new ViewsApiParamError(param, `Invalid ${param}: ${value}`, ['1', '0', 'true', 'false']);
}

export interface NumberParamOptions {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export function parseNumberParam(
  value: string | null,
  param: string,
  fallback: number,
  options: NumberParamOptions = {},
): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (number required)`);
  }
  if (options.integer && !Number.isInteger(parsed)) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (integer required)`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (minimum ${options.min})`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (maximum ${options.max})`);
  }
  return parsed;
}

export function parseDateParam(value: string | null, param: string): string | undefined {
  if (!value) return undefined;
  if (!DATE_PATTERN.test(value)) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (YYYY-MM-DD required)`);
  }
  return value;
}

const METRIC_CONFIG_VALUES = ['y', 'y_*', 'see /api/v1/views/options metrics[].configKey'];

/** Accepts `y_costh`, `costh`, and the legacy `y` alias; unknown metrics are a 400. */
export function parseMetricParam(
  value: string | null,
  fallback: MetricConfigKey = DEFAULT_METRIC_CONFIG_KEY,
  param = 'metric',
): MetricConfigKey {
  if (!value) return fallback;
  if (value === 'y') return 'y_tpPerGpu';
  const configKey = value.startsWith('y_') ? value : `y_${value}`;
  const metricKey = configKey.slice(2);
  if (isMetricKey(metricKey)) return configKey as MetricConfigKey;
  throw new ViewsApiParamError(param, `Unknown ${param}: ${value}`, METRIC_CONFIG_VALUES);
}

export const VIEWS_FORMATS = ['json', 'csv'] as const;
export type ViewsFormat = (typeof VIEWS_FORMATS)[number];

export function parseFormatParam(value: string | null): ViewsFormat {
  return parseEnumParam(value, 'format', VIEWS_FORMATS, 'json');
}
