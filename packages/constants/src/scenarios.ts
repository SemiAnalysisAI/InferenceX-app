import type { CategoryTag } from './models';

export type ScenarioKind = 'fixed-seq' | 'agentic';

export interface ScenarioEntry {
  label: string;
  labelZh: string;
  /** The form artifact names carry (`1k1k`). */
  compact: string;
  /** URL path segment, also accepted as an API alias (`8k-1k`). */
  segment: string;
  category: CategoryTag;
  kind: ScenarioKind;
  /** Input and output sequence lengths in tokens; fixed-sequence scenarios only. */
  isl?: number;
  osl?: number;
}

/** Every scenario, keyed by its API and URL-state value, in selector order. */
export const SCENARIO_REGISTRY = {
  '1k/1k': {
    label: '1K / 1K',
    labelZh: '1K / 1K',
    compact: '1k1k',
    segment: '1k-1k',
    category: 'deprecated',
    kind: 'fixed-seq',
    isl: 1024,
    osl: 1024,
  },
  '1k/8k': {
    label: '1K / 8K',
    labelZh: '1K / 8K',
    compact: '1k8k',
    segment: '1k-8k',
    category: 'deprecated',
    kind: 'fixed-seq',
    isl: 1024,
    osl: 8192,
  },
  '8k/1k': {
    label: '8K / 1K',
    labelZh: '8K / 1K',
    compact: '8k1k',
    segment: '8k-1k',
    category: 'default',
    kind: 'fixed-seq',
    isl: 8192,
    osl: 1024,
  },
  'agentic-traces': {
    label: 'Agentic',
    labelZh: '智能体',
    compact: 'agentic',
    segment: 'agentic',
    category: 'default',
    kind: 'agentic',
  },
} as const satisfies Record<string, ScenarioEntry>;

export type ScenarioKey = keyof typeof SCENARIO_REGISTRY;

export const SCENARIO_KEYS = Object.keys(SCENARIO_REGISTRY) as ScenarioKey[];

const ENTRIES: Record<ScenarioKey, ScenarioEntry> = SCENARIO_REGISTRY;

export function isScenarioKey(value: string): value is ScenarioKey {
  return Object.hasOwn(SCENARIO_REGISTRY, value);
}

/** Convert a scenario to its ISL/OSL in tokens; null for one without fixed lengths. */
export function scenarioToIslOsl(scenario: string): { isl: number; osl: number } | null {
  const entry = ENTRIES[scenario as ScenarioKey];
  return entry?.isl && entry.osl ? { isl: entry.isl, osl: entry.osl } : null;
}

const ISL_OSL_TO_SCENARIO: Record<string, ScenarioKey> = Object.fromEntries(
  SCENARIO_KEYS.filter((key) => ENTRIES[key].isl).map((key) => [
    `${ENTRIES[key].isl}_${ENTRIES[key].osl}`,
    key,
  ]),
);

/** Convert ISL/OSL in tokens to the scenario with those lengths. */
export function islOslToScenario(isl: number, osl: number): string | null {
  return ISL_OSL_TO_SCENARIO[`${isl}_${osl}`] ?? null;
}

/**
 * Map a benchmark/availability row to its scenario.
 * - `agentic_traces` rows map to `'agentic-traces'` regardless of isl/osl.
 * - Other rows (today: `single_turn`) fall back to `islOslToScenario`.
 * Returns `null` for rows that can't be classified (e.g. `single_turn` with
 * unmapped isl/osl values).
 */
export function rowToScenario(row: {
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
}): string | null {
  if (row.benchmark_type === 'agentic_traces') return 'agentic-traces';
  if (row.isl === null || row.osl === null) return null;
  return islOslToScenario(row.isl, row.osl);
}
