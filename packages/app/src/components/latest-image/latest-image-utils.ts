import type { CSSProperties } from 'react';

import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants';

import type { FrameworkReleases, LatestImageRow } from '@/lib/api';
import {
  Model,
  Sequence,
  getModelCategory,
  getSequenceCategoryForModel,
} from '@/lib/data-mappings';

const MODEL_VALUES = new Set<string>(Object.values(Model));
const SEQUENCE_VALUES = new Set<string>(Object.values(Sequence));

/**
 * Display name for an image row — the `Model` enum value when the DB key is
 * mapped, otherwise the raw DB key so unconfigured models still render.
 */
export function imageRowDisplayModel(row: Pick<LatestImageRow, 'model'>): string {
  return DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
}

/** The configured `Model` behind an image row, or null for DB keys the app has no config for. */
export function imageRowModel(row: Pick<LatestImageRow, 'model'>): Model | null {
  const display = imageRowDisplayModel(row);
  return MODEL_VALUES.has(display) ? (display as Model) : null;
}

/**
 * Scenario key for a row: 'agentic-traces' for AgentX rows (null isl/osl), the
 * mapped '1k/1k'-style string for fixed-sequence rows, raw `isl/osl` fallback
 * for unmapped fixed-sequence combos so they stay selectable rather than vanishing.
 */
export function imageRowSequence(
  row: Pick<LatestImageRow, 'isl' | 'osl' | 'benchmark_type'>,
): string {
  return rowToSequence(row) ?? `${row.isl}/${row.osl}`;
}

/**
 * Whether an image row belongs to a model × scenario pair InferenceX still
 * benchmarks. The latest-images query returns the newest image per config
 * regardless of age, so without this gate retired combinations (every
 * deprecated model, the globally retired 1K/1K and 1K/8K sweeps, and
 * per-model retirements such as MiniMax M3's 8K/1K) keep presenting as live
 * images that need refreshing. The rules mirror the scenario selector:
 *
 * - deprecated or hidden models are out on every scenario;
 * - a scenario is out when `getSequenceCategoryForModel` marks it deprecated
 *   for the row's model (or globally, when the model is unconfigured);
 * - unconfigured models and unmapped isl/osl combos stay in, because nothing
 *   in the app declares them retired and hiding a brand-new sweep would be
 *   worse than showing it.
 */
export function isActiveImageRow(
  row: Pick<LatestImageRow, 'model' | 'isl' | 'osl' | 'benchmark_type'>,
): boolean {
  const model = imageRowModel(row);
  if (model) {
    const category = getModelCategory(model);
    if (category === 'deprecated' || category === 'hidden') return false;
  }
  const sequence = imageRowSequence(row);
  if (!SEQUENCE_VALUES.has(sequence)) return true;
  return getSequenceCategoryForModel(sequence as Sequence, model) !== 'deprecated';
}

/**
 * Scenario keys offered for the model filter, sorted. `'all'` unions every
 * active row; a specific display model narrows to the scenarios that model
 * still runs, so MiniMax M3 offers Agentic only while Qwen3.5 offers 8K/1K and
 * Agentic. Callers pass rows already filtered through `isActiveImageRow`.
 */
export function sequenceOptionsForModel(
  rows: readonly Pick<LatestImageRow, 'model' | 'isl' | 'osl' | 'benchmark_type'>[],
  selectedModel: string,
): string[] {
  const sequences = new Set<string>();
  for (const row of rows) {
    if (selectedModel !== 'all' && imageRowDisplayModel(row) !== selectedModel) continue;
    sequences.add(imageRowSequence(row));
  }
  return [...sequences].toSorted();
}

/**
 * The scenario the table actually filters on: the user's pick when the model
 * still offers it, else the first offered scenario, else the pick itself so an
 * empty catalog renders its no-match state rather than a phantom selection.
 */
export function resolveSelectedSequence(options: readonly string[], selected: string): string {
  if (options.includes(selected)) return selected;
  return options[0] ?? selected;
}

/** Map framework variants to their base framework for release lookup. */
export const FRAMEWORK_TO_BASE: Record<string, string> = {
  vllm: 'vllm',
  sglang: 'sglang',
  'dynamo-sglang': 'sglang',
  'llmd-vllm': 'vllm',
  'mori-sglang': 'sglang',
};

/** Collapse framework variants into the engine family used by the UI filter. */
export function baseFramework(framework: string): string {
  const mapped = FRAMEWORK_TO_BASE[framework];
  if (mapped) return mapped;
  if (framework.startsWith('dynamo-')) return framework.slice('dynamo-'.length);
  if (framework.startsWith('mori-')) return framework.slice('mori-'.length);
  return framework;
}

/**
 * Substrings that mark an image tag as unstable / pre-release. Lowercased
 * comparison — kept here (not inlined) so tests can re-import and stay in
 * sync with the runtime classifier.
 */
export const UNSTABLE_PATTERNS = ['nightly', 'rocm/sgl-dev', 'sglang-rocm'];

/** Age past which the cell is rendered at max red — anything older looks identical. */
export const AGE_MAX_RED_DAYS = 60;

/**
 * AgentX (agentic) submissions must be refreshed at least every two weeks —
 * anything older is stale regardless of whether its image tag still matches
 * the latest framework release.
 */
export const AGENTX_MAX_AGE_DAYS = 14;

/** True when an agentic (AgentX) row's last submission is older than the two-week budget. */
export function isStaleAgentx(benchmarkType: string, ageDays: number): boolean {
  return benchmarkType === 'agentic_traces' && ageDays > AGENTX_MAX_AGE_DAYS;
}

/** Preserve the legacy English product spelling while using the reviewed Chinese copy. */
export function getCurrentImageNodeTypeTooltip(locale: 'en' | 'zh'): string {
  return locale === 'zh'
    ? '单节点指非分离式推理；分离式配置使用独立的 prefill/decode 池，包括 Dynamo、MoRI 和 llm-d。'
    : 'Single node = non-disaggregated serving. Disaggregated = separate prefill/decode pools, including Dynamo, Mori, and llm-d.';
}

/** Whole-day delta between today (UTC) and an ISO date string (YYYY-MM-DD). */
export function daysSince(dateStr: string, today: Date): number {
  const submitted = new Date(`${dateStr}T00:00:00Z`).getTime();
  const ms = today.getTime() - submitted;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Inline style for the Days-Since-Update cell so older rows scream louder
 * visually. Ramps from a subtle red at 1 day to deep red at 60 days (then
 * clamps); 0-day rows return `undefined` so the cell falls back to the
 * muted-foreground class.
 */
export function ageColorStyle(days: number): CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  // Perceptually-uniform OKLCH ramp at hue 25 (red): lightness drops as
  // chroma rises, so the cell goes from light pink to saturated dark red.
  const L = 0.78 - 0.28 * t;
  const C = 0.12 + 0.12 * t;
  return { color: `oklch(${L.toFixed(3)} ${C.toFixed(3)} 25)` };
}

/**
 * Companion to ageColorStyle for the whole row's background tint — same
 * 1d → 60d ramp but expressed as a low-alpha fill so the row content stays
 * readable. 0-day rows return undefined so the row falls back to its
 * hover-only class background.
 */
export function ageRowStyle(days: number): CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  // Alpha tops out around 0.28 — enough that 60d+ rows are unmistakably
  // tinted without drowning out the text or competing with hover affordance.
  const alpha = (0.04 + 0.24 * t).toFixed(3);
  return { backgroundColor: `oklch(0.60 0.22 25 / ${alpha})` };
}

/** Check if the image tag is outdated or uses an unstable/dev image. */
export function isOutdated(image: string, actualLatest: string | null): boolean {
  const lower = image.toLowerCase();
  if (UNSTABLE_PATTERNS.some((p) => lower.includes(p))) return true;
  if (!actualLatest) return false;
  return !image.includes(actualLatest);
}

export function getActualLatestTag(
  framework: string,
  releases: FrameworkReleases | undefined,
): string | null {
  if (!releases) return null;
  const base = FRAMEWORK_TO_BASE[framework];
  if (!base) return null;
  return releases[base] ?? null;
}
