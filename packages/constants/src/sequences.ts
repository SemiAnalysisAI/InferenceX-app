import type { CategoryTag } from './models';

export type ScenarioKind = 'fixed-seq' | 'agentic';

export interface SequenceEntry {
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

/** Every sequence (scenario), keyed by its API and URL-state value, in selector order. */
export const SEQUENCE_REGISTRY = {
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
} as const satisfies Record<string, SequenceEntry>;

export type SequenceKey = keyof typeof SEQUENCE_REGISTRY;

export const SEQUENCE_KEYS = Object.keys(SEQUENCE_REGISTRY) as SequenceKey[];

const ENTRIES: Record<SequenceKey, SequenceEntry> = SEQUENCE_REGISTRY;

export function isSequenceKey(value: string): value is SequenceKey {
  return Object.hasOwn(SEQUENCE_REGISTRY, value);
}

/** Convert a frontend sequence string to ISL/OSL in tokens. */
export function sequenceToIslOsl(seq: string): { isl: number; osl: number } | null {
  const entry = ENTRIES[seq as SequenceKey];
  return entry?.isl && entry.osl ? { isl: entry.isl, osl: entry.osl } : null;
}

const ISL_OSL_TO_SEQUENCE: Record<string, SequenceKey> = Object.fromEntries(
  SEQUENCE_KEYS.filter((key) => ENTRIES[key].isl).map((key) => [
    `${ENTRIES[key].isl}_${ENTRIES[key].osl}`,
    key,
  ]),
);

/** Convert ISL/OSL in tokens to a frontend sequence string. */
export function islOslToSequence(isl: number, osl: number): string | null {
  return ISL_OSL_TO_SEQUENCE[`${isl}_${osl}`] ?? null;
}

/**
 * Map a benchmark/availability row to its sequence (scenario) string.
 * - `agentic_traces` rows map to `'agentic-traces'` regardless of isl/osl.
 * - Other rows (today: `single_turn`) fall back to `islOslToSequence`.
 * Returns `null` for rows that can't be classified (e.g. `single_turn` with
 * unmapped isl/osl values).
 */
export function rowToSequence(row: {
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
}): string | null {
  if (row.benchmark_type === 'agentic_traces') return 'agentic-traces';
  if (row.isl === null || row.osl === null) return null;
  return islOslToSequence(row.isl, row.osl);
}
