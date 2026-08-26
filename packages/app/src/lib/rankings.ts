/**
 * @file rankings.ts
 * @description Slug registry, ranking derivation, and copy builders for the
 * indexable `/rankings/<slug>` pages.
 *
 * Two ranking kinds exist per model, matching the two questions people
 * actually type into a search box:
 *
 *   - `fastest-gpu-for-<model>`  — hardware ranked by measured tokens/s per
 *     GPU at the overview's primary interactivity tier.
 *   - `cheapest-gpu-for-<model>` — hardware ranked by $ per million total
 *     tokens at hyperscaler $/GPU/hr pricing, same tier.
 *
 * The ranking engine is NOT reimplemented here: rows come from
 * `buildOverviewModelSummary`, the exact same derivation the /overview
 * leaderboard renders, so a ranking page can never disagree with the
 * dashboard. This module only sorts, filters, and words the result.
 *
 * Model slugs reuse `INFERENCE_MODEL_SLUGS` — the /inference, /compare, and
 * /run vocabulary — so every ranking row can deep-link to its pair page.
 */

import { getAllChipPages, type ChipPageEntry } from '@/lib/chip-pages';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { INFERENCE_MODEL_SLUGS, type InferenceModelSlug } from '@/lib/inference-model-slug';
import type {
  OverviewModelSummary,
  OverviewPlatformResult,
  OverviewScenario,
} from '@/lib/overview-data';

export const RANKING_KINDS = ['fastest-gpu', 'cheapest-gpu'] as const;
export type RankingKind = (typeof RANKING_KINDS)[number];

export interface RankingPageEntry {
  /** Canonical URL slug under /rankings/, e.g. 'fastest-gpu-for-kimi-k3'. */
  slug: string;
  kind: RankingKind;
  /** Model registry entry — same slug vocabulary as /inference/<model>. */
  model: InferenceModelSlug;
  /** DB keys to fetch benchmark rows for, from the compare registry. */
  dbKeys: string[];
}

const DB_KEYS_BY_MODEL_SLUG: ReadonlyMap<string, string[]> = new Map(
  COMPARE_MODEL_SLUGS.map((entry) => [entry.slug, entry.dbKeys]),
);

function buildEntries(): RankingPageEntry[] {
  const out: RankingPageEntry[] = [];
  for (const kind of RANKING_KINDS) {
    for (const model of INFERENCE_MODEL_SLUGS) {
      const dbKeys = DB_KEYS_BY_MODEL_SLUG.get(model.slug);
      if (!dbKeys) continue;
      out.push({ slug: `${kind}-for-${model.slug}`, kind, model, dbKeys });
    }
  }
  return out;
}

const ENTRIES: readonly RankingPageEntry[] = buildEntries();

const ENTRY_BY_SLUG: ReadonlyMap<string, RankingPageEntry> = new Map(
  ENTRIES.map((entry) => [entry.slug, entry]),
);

export function getAllRankingPageEntries(): readonly RankingPageEntry[] {
  return ENTRIES;
}

export function getRankingPageEntry(slug: string): RankingPageEntry | undefined {
  return ENTRY_BY_SLUG.get(slug.toLowerCase());
}

export function rankingPagePath(entry: RankingPageEntry): string {
  return `/rankings/${entry.slug}`;
}

// ---------------------------------------------------------------------------
// Ranking derivation (pure — operates on the overview summary shape)
// ---------------------------------------------------------------------------

export interface RankingRow {
  rank: number;
  /** HW_REGISTRY key, e.g. 'gb200'. */
  hardware: string;
  hardwareLabel: string;
  /** /chips/<slug> registry entry when one exists for this hardware. */
  chip: ChipPageEntry | null;
  /** Measured tokens/s per GPU at the ranking tier; null when unavailable. */
  throughputPerGpu: number | null;
  /** $ per million total tokens at hyperscaler $/GPU/hr; null when unavailable. */
  costPerMtok: number | null;
  /** Precision of the winning config, e.g. 'fp4'. */
  precision: string | null;
  /** Framework label of the winning config, e.g. 'SGLang'. */
  framework: string | null;
  /** Whether the winning config runs disaggregated prefill/decode. */
  disagg: boolean | null;
}

const CHIP_BY_HW_KEY: ReadonlyMap<string, ChipPageEntry> = new Map(
  getAllChipPages().map((chip) => [chip.hwKey, chip]),
);

export function chipForHardware(hardware: string): ChipPageEntry | null {
  return CHIP_BY_HW_KEY.get(hardware) ?? null;
}

function toRankingRow(platform: OverviewPlatformResult, rank: number): RankingRow {
  return {
    rank,
    hardware: platform.hardware,
    hardwareLabel: platform.hardwareLabel,
    chip: chipForHardware(platform.hardware),
    throughputPerGpu: platform.read.value,
    costPerMtok: platform.costPerMtok,
    precision: platform.read.config?.precision ?? platform.precision,
    framework: platform.read.config?.frameworkLabel ?? null,
    disagg: platform.read.config?.disagg ?? null,
  };
}

/** Sort and rank the overview platforms for one ranking kind. Platforms with
 *  no measurement for the metric are dropped rather than ranked last, so an
 *  under-swept GPU is never presented as "slowest". */
export function buildRankingRows(summary: OverviewModelSummary, kind: RankingKind): RankingRow[] {
  const measurable = summary.platforms.filter((platform) =>
    kind === 'fastest-gpu' ? platform.read.value !== null : platform.costPerMtok !== null,
  );
  const sorted = [...measurable].sort((a, b) => {
    if (kind === 'fastest-gpu') return (b.read.value ?? 0) - (a.read.value ?? 0);
    return (
      (a.costPerMtok ?? Number.POSITIVE_INFINITY) - (b.costPerMtok ?? Number.POSITIVE_INFINITY)
    );
  });
  return sorted.map((platform, index) => toRankingRow(platform, index + 1));
}

/** Human wording for the overview scenario a ranking or run page is read
 *  from. EN and ZH variants live together so the two locales cannot drift. */
export function scenarioLabel(scenario: OverviewScenario, locale: 'en' | 'zh'): string {
  if (scenario === 'agentx') {
    return locale === 'zh' ? 'AgentX 智能体编码工作负载' : 'the AgentX agentic coding workload';
  }
  return locale === 'zh'
    ? '单轮对话工作负载（8k 输入 / 1k 输出）'
    : 'a single-turn chat workload (8k input / 1k output)';
}

// ---------------------------------------------------------------------------
// English copy
// ---------------------------------------------------------------------------

export function rankingPageTitle(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `Fastest GPU for ${entry.model.seoName} Inference: Live Rankings`
    : `Cheapest GPU to Run ${entry.model.seoName}: $ per Million Tokens`;
}

export function rankingPageHeading(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `Fastest GPU for ${entry.model.seoName}`
    : `Cheapest GPU for ${entry.model.seoName}`;
}

/** Static fallback meta description; the route swaps in a stat-led one when
 *  live numbers are available. */
export function rankingPageDescription(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `Which GPU serves ${entry.model.seoName} fastest? Live ranking of NVIDIA and AMD hardware by measured tokens per second per GPU, re-benchmarked continuously.`
    : `Which GPU serves ${entry.model.seoName} cheapest? Live ranking by measured $ per million tokens at hyperscaler GPU pricing, re-benchmarked continuously.`;
}

export function rankingPageKeywords(entry: RankingPageEntry): string[] {
  const model = entry.model.seoName;
  if (entry.kind === 'fastest-gpu') {
    return [
      `fastest GPU for ${model}`,
      `best GPU for ${model}`,
      `${model} GPU benchmark`,
      `${model} tokens per second`,
      `${model} inference speed`,
      `${model} GPU ranking`,
      `${model} H100 B200 MI355X comparison`,
      `${model} inference hardware`,
    ];
  }
  return [
    `cheapest GPU for ${model}`,
    `${model} cost per million tokens`,
    `${model} inference cost`,
    `cheapest way to run ${model}`,
    `${model} GPU cost comparison`,
    `${model} serving cost`,
    `${model} $ per token`,
    `${model} inference pricing`,
  ];
}
