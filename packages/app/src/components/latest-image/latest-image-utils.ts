import type { CSSProperties } from 'react';

import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants';

import type { FrameworkRelease, FrameworkReleases, LatestImageRow } from '@/lib/api/api';
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
  'vllm-disagg': 'vllm',
};

export function baseFramework(framework: string): string {
  const mapped = FRAMEWORK_TO_BASE[framework];
  if (mapped) return mapped;
  if (framework.startsWith('dynamo-')) return framework.slice('dynamo-'.length);
  if (framework.startsWith('mori-')) return framework.slice('mori-'.length);
  return framework;
}

export type Version = readonly [number, number, number, number];

/** First `X.Y.Z` (optionally `.postN`) that starts the string or follows `v`, `-`, `_`, `:`. */
export function parseVersion(text: string): Version | null {
  const v = /(?:^|[-_:])v?(?<a>\d+)\.(?<b>\d+)\.(?<c>\d+)(?:\.?post(?<p>\d+))?(?![\d.])/i.exec(
    text,
  )?.groups;
  if (!v) return null;
  return [Number(v.a), Number(v.b), Number(v.c), Number(v.p ?? 0)];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function imageTag(image: string): string {
  const ref = image.split('@')[0];
  const colon = ref.lastIndexOf(':');
  return colon > ref.lastIndexOf('/') ? ref.slice(colon + 1) : ref;
}

function nightlyBuildDate(tag: string): string | null {
  const date =
    /(?:^|\D)(?<y>20\d{2})(?<m>0[1-9]|1[0-2])(?<d>0[1-9]|[12]\d|3[01])(?:\d{4})?(?!\d)/.exec(
      tag,
    )?.groups;
  return date ? `${date.y}-${date.m}-${date.d}` : null;
}

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

/**
 * Versioned tags compare against the release version. Nightlies compare their build date (from
 * the tag, else the submission date as an upper bound) against the release date. Anything else,
 * or a framework without a release stream, is not flagged.
 */
export function isOutdated(
  image: string,
  release: FrameworkRelease | null,
  submittedDate: string,
): boolean {
  if (!release) return false;
  const latest = parseVersion(release.tag);
  const tag = imageTag(image);
  const version = parseVersion(tag);
  if (version && latest) return compareVersions(version, latest) < 0;
  if (!/nightly/i.test(tag)) return false;
  return (nightlyBuildDate(tag) ?? submittedDate) < release.publishedAt.slice(0, 10);
}

export function getActualLatestRelease(
  framework: string,
  releases: FrameworkReleases | undefined,
): FrameworkRelease | null {
  return releases?.[baseFramework(framework)] ?? null;
}
