import { getAllChipPages, type ChipPageEntry } from '@/lib/catalog/chip-pages';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { INFERENCE_MODEL_SLUGS, type InferenceModelSlug } from '@/lib/routing/inference-model-slug';
import type {
  OverviewModelSummary,
  OverviewPlatformResult,
  OverviewScenario,
} from '@/lib/overview/overview-data';
import { fitMetaTitle } from '@/lib/seo/meta-text';

export const RANKING_KINDS = ['fastest-gpu', 'cheapest-gpu'] as const;
export type RankingKind = (typeof RANKING_KINDS)[number];

export interface RankingPageEntry {
  slug: string;
  kind: RankingKind;
  model: InferenceModelSlug;
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

export interface RankingRow {
  rank: number;
  hardware: string;
  hardwareLabel: string;
  chip: ChipPageEntry | null;
  throughputPerGpu: number | null;
  costPerMtok: number | null;
  precision: string | null;
  framework: string | null;
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

export function scenarioLabel(scenario: OverviewScenario, locale: 'en' | 'zh'): string {
  if (scenario === 'agentx') {
    return locale === 'zh' ? 'AgentX coding agent 工作负载' : 'the AgentX agentic coding workload';
  }
  return locale === 'zh'
    ? '单轮对话工作负载（8k 输入 / 1k 输出）'
    : 'a single-turn chat workload (8k input / 1k output)';
}

export function rankingPageTitle(entry: RankingPageEntry): string {
  const model = entry.model.seoName;
  return entry.kind === 'fastest-gpu'
    ? fitMetaTitle([
        `Fastest GPU for ${model} Inference: Live Rankings`,
        `Fastest GPU for ${model} Inference`,
        `Fastest GPU for ${model}`,
      ])
    : fitMetaTitle([
        `Cheapest GPU to Run ${model}: $ per Million Tokens`,
        `Cheapest GPU to Run ${model}: $/M Tokens`,
        `Cheapest GPU for ${model}`,
      ]);
}

export function rankingPageHeading(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `Fastest GPU for ${entry.model.seoName}`
    : `Cheapest GPU for ${entry.model.seoName}`;
}

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
