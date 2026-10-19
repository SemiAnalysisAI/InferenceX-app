import { DISPLAY_MODEL_TO_DB, GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type { CalculatorMode, CostProvider, CostType } from '@/components/calculator/types';
import {
  DEFAULT_METRIC_CONFIG_KEY,
  isMetricKey,
  type MetricConfigKey,
} from '@/components/inference/metric-registry';
import {
  FRAMEWORK_FAMILIES,
  parseDeploymentModes,
  VENDOR_ORDER,
  type DeploymentMode,
  type SpecMode,
} from '@/components/inference/utils/quickFilters';
import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import {
  Percentile,
  PRECISION_OPTIONS,
  Sequence,
  type Precision,
} from '@/lib/catalog/data-mappings';

import { ViewsApiParamError } from './errors';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export interface ResolvedModel {
  readonly displayName: string;
  readonly dbModelKeys: readonly string[];
}

const DISPLAY_NAMES = Object.keys(DISPLAY_MODEL_TO_DB);
const LOWERCASE_DISPLAY_TO_CANONICAL = new Map(
  DISPLAY_NAMES.map((name) => [name.toLowerCase(), name]),
);
const SLUG_TO_DISPLAY = new Map(
  COMPARE_MODEL_SLUGS.map((entry) => [entry.slug, entry.displayName]),
);

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
  const alias = value.toLowerCase();
  if (!Object.hasOwn(SEQUENCE_ALIASES, alias)) {
    throw new ViewsApiParamError(param, `Unknown sequence: ${value}`, VIEWS_SEQUENCE_VALUES);
  }
  return SEQUENCE_ALIASES[alias];
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

export function parseFreeListParam(value: string | null): string[] {
  if (!value) return [];
  const items = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
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
  if (options.integer && !Number.isSafeInteger(parsed)) {
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
  if (
    !DATE_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (YYYY-MM-DD required)`);
  }
  return value;
}

const METRIC_CONFIG_VALUES = ['y', 'y_*', 'see /api/v1/views/options metrics[].configKey'];

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

const RUN_ID_PATTERN = /^[1-9]\d*$/u;
export const MAX_RUN_ID_LIST = 8;

function isValidRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value) && Number.isSafeInteger(Number(value));
}

export function parseRunIdParam(value: string | null, param = 'runId'): string | undefined {
  if (value === null || value === '') return undefined;
  if (!isValidRunId(value)) {
    throw new ViewsApiParamError(param, `Invalid ${param}: ${value} (positive integer required)`);
  }
  return value;
}

export function assertRunIdList(ids: readonly string[], param: string): void {
  if (ids.length > MAX_RUN_ID_LIST || ids.some((id) => !isValidRunId(id))) {
    throw new ViewsApiParamError(
      param,
      `Expected up to ${MAX_RUN_ID_LIST} positive safe numeric run IDs`,
    );
  }
}

export function parseRunIdListParam(value: string | null, param: string): string[] {
  if (!value) return [];
  const ids = [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  assertRunIdList(ids, param);
  return ids;
}

export const CALCULATOR_PERCENTILE_VALUES = [Percentile.P75, Percentile.P90] as const;

export const CALCULATOR_MODE_VALUES = [
  'interactivity-to-throughput',
  'throughput-to-interactivity',
] as const;
export type CalculatorModeParam = (typeof CALCULATOR_MODE_VALUES)[number];
export const CALCULATOR_MODE_TO_INTERNAL: Record<CalculatorModeParam, CalculatorMode> = {
  'interactivity-to-throughput': 'interactivity_to_throughput',
  'throughput-to-interactivity': 'throughput_to_interactivity',
};
export const CALCULATOR_DEFAULT_TARGET = 35;

export const TCO_BASIS_VALUES = ['internal', 'external'] as const satisfies readonly TcoBasis[];
export const COST_PROVIDER_VALUES = ['costh', 'costr'] as const satisfies readonly CostProvider[];
export const COST_TYPE_VALUES = ['total', 'input', 'output'] as const satisfies readonly CostType[];
export const DEFAULT_COST_PROVIDER: CostProvider = 'costh';
export const DEFAULT_COST_TYPE: CostType = 'total';

export function parseTcoBasisParam(value: string | null, param = 'tcoBasis'): TcoBasis {
  return parseEnumParam(value, param, TCO_BASIS_VALUES, DEFAULT_TCO_BASIS);
}

export function parseCostProviderParam(value: string | null, param = 'costProvider'): CostProvider {
  return parseEnumParam(value, param, COST_PROVIDER_VALUES, DEFAULT_COST_PROVIDER);
}

export function parseCostTypeParam(value: string | null, param = 'costType'): CostType {
  return parseEnumParam(value, param, COST_TYPE_VALUES, DEFAULT_COST_TYPE);
}

const REGISTRY_VENDORS = new Set(Object.values(GPU_VENDORS));
export const VENDOR_VALUES: readonly string[] = [
  ...VENDOR_ORDER.filter((vendor) => REGISTRY_VENDORS.has(vendor)),
  ...[...REGISTRY_VENDORS].filter((vendor) => !VENDOR_ORDER.includes(vendor)).toSorted(),
];
export const FRAMEWORK_FAMILY_VALUES: readonly string[] = FRAMEWORK_FAMILIES.map(
  (family) => family.key,
).toSorted();
export const DEPLOYMENT_MODES = [
  'single-node',
  'multi-node',
  'disagg',
] as const satisfies readonly DeploymentMode[];
export const DEPLOYMENT_VALUES = ['agg', ...DEPLOYMENT_MODES] as const;
export const SPEC_MODES = ['mtp', 'stp'] as const satisfies readonly SpecMode[];

export function parseVendorsParam(value: string | null, param = 'vendors'): string[] {
  return parseListParam(value, param, VENDOR_VALUES);
}

export function parseFrameworkFamiliesParam(value: string | null, param = 'frameworks'): string[] {
  return parseListParam(value, param, FRAMEWORK_FAMILY_VALUES);
}

export function parseDeploymentParam(value: string | null, param = 'deployment'): DeploymentMode[] {
  return parseDeploymentModes(parseListParam(value, param, DEPLOYMENT_VALUES)).toSorted();
}

export function parseSpecModesParam(value: string | null, param = 'spec'): SpecMode[] {
  return parseListParam(value, param, SPEC_MODES);
}

export function matchesHardware(hwKey: string, gpus: readonly string[]): boolean {
  if (gpus.length === 0) return true;
  const lowered = hwKey.toLowerCase();
  const base = lowered.split('_')[0];
  return gpus.some((gpu) => gpu === lowered || gpu === base);
}

export const VIEWS_FORMATS = ['json', 'csv'] as const;
export type ViewsFormat = (typeof VIEWS_FORMATS)[number];

export function parseFormatParam(value: string | null): ViewsFormat {
  return parseEnumParam(value, 'format', VIEWS_FORMATS, 'json');
}

export function validateParams(search: URLSearchParams, allowed: readonly string[]): void {
  for (const key of search.keys()) {
    if (!allowed.includes(key))
      throw new ViewsApiParamError(key, `Unknown parameter: ${key}`, allowed);
    if (search.getAll(key).length > 1)
      throw new ViewsApiParamError(key, `Repeated parameter: ${key}`);
  }
}

export function parseNumberMap(value: string | null, param: string): Record<string, number> {
  if (!value) return {};
  let object: unknown;
  try {
    object = JSON.parse(value);
  } catch {
    throw new ViewsApiParamError(
      param,
      'Expected a JSON object of hardware keys and non-negative numbers',
    );
  }
  if (!object || Array.isArray(object) || typeof object !== 'object')
    throw new ViewsApiParamError(param, 'Expected an object');
  const entries = Object.entries(object);
  if (
    entries.length > 100 ||
    entries.some(
      ([key, v]) =>
        !/^[a-zA-Z0-9_-]+$/.test(key) ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        typeof v !== 'number' ||
        !Number.isFinite(v) ||
        v < 0,
    )
  )
    throw new ViewsApiParamError(
      param,
      'Expected at most 100 hardware keys with finite non-negative values',
    );
  return Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b)));
}
