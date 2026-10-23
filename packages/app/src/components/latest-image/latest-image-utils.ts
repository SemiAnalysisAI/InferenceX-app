import type { CSSProperties } from 'react';

import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants';

import type { FrameworkReleases, LatestImageRow } from '@/lib/api/api';
import {
  Model,
  Sequence,
  getModelCategory,
  getSequenceCategoryForModel,
} from '@/lib/catalog/data-mappings';

const MODEL_VALUES = new Set<string>(Object.values(Model));
const SEQUENCE_VALUES = new Set<string>(Object.values(Sequence));

export function imageRowDisplayModel(row: Pick<LatestImageRow, 'model'>): string {
  return DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
}

export function imageRowModel(row: Pick<LatestImageRow, 'model'>): Model | null {
  const display = imageRowDisplayModel(row);
  return MODEL_VALUES.has(display) ? (display as Model) : null;
}

export function imageRowSequence(
  row: Pick<LatestImageRow, 'isl' | 'osl' | 'benchmark_type'>,
): string {
  return rowToSequence(row) ?? `${row.isl}/${row.osl}`;
}

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

export function resolveSelectedSequence(options: readonly string[], selected: string): string {
  if (options.includes(selected)) return selected;
  return options[0] ?? selected;
}

export const FRAMEWORK_TO_BASE: Record<string, string> = {
  vllm: 'vllm',
  sglang: 'sglang',
  'dynamo-sglang': 'sglang',
  'llmd-vllm': 'vllm',
  'mori-sglang': 'sglang',
};

export function baseFramework(framework: string): string {
  const mapped = FRAMEWORK_TO_BASE[framework];
  if (mapped) return mapped;
  if (framework.startsWith('dynamo-')) return framework.slice('dynamo-'.length);
  if (framework.startsWith('mori-')) return framework.slice('mori-'.length);
  return framework;
}

export const UNSTABLE_PATTERNS = ['nightly', 'rocm/sgl-dev', 'sglang-rocm'];

export const AGE_MAX_RED_DAYS = 60;

export const AGENTX_MAX_AGE_DAYS = 14;

export function isStaleAgentx(benchmarkType: string, ageDays: number): boolean {
  return benchmarkType === 'agentic_traces' && ageDays > AGENTX_MAX_AGE_DAYS;
}

export function getCurrentImageNodeTypeTooltip(locale: 'en' | 'zh'): string {
  return locale === 'zh'
    ? '单节点指非分离式推理；分离式配置使用独立的 prefill/decode 池，包括 Dynamo、MoRI 和 llm-d。'
    : 'Single node = non-disaggregated serving. Disaggregated = separate prefill/decode pools, including Dynamo, Mori, and llm-d.';
}

export function daysSince(dateStr: string, today: Date): number {
  const submitted = new Date(`${dateStr}T00:00:00Z`).getTime();
  const ms = today.getTime() - submitted;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function ageColorStyle(days: number): CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  const L = 0.78 - 0.28 * t;
  const C = 0.12 + 0.12 * t;
  return { color: `oklch(${L.toFixed(3)} ${C.toFixed(3)} 25)` };
}

export function ageRowStyle(days: number): CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  const alpha = (0.04 + 0.24 * t).toFixed(3);
  return { backgroundColor: `oklch(0.60 0.22 25 / ${alpha})` };
}

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
