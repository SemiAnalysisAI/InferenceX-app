import { getAllChipPages, type ChipPageEntry } from '@/lib/catalog/chip-pages';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { INFERENCE_MODEL_SLUGS, type InferenceModelSlug } from '@/lib/routing/inference-model-slug';

export interface RunPageEntry {
  slug: string;
  model: InferenceModelSlug;
  dbKeys: string[];
  chip: ChipPageEntry;
}

const DB_KEYS_BY_MODEL_SLUG: ReadonlyMap<string, string[]> = new Map(
  COMPARE_MODEL_SLUGS.map((entry) => [entry.slug, entry.dbKeys]),
);

function buildEntries(): RunPageEntry[] {
  const out: RunPageEntry[] = [];
  for (const model of INFERENCE_MODEL_SLUGS) {
    const dbKeys = DB_KEYS_BY_MODEL_SLUG.get(model.slug);
    if (!dbKeys) continue;
    for (const chip of getAllChipPages()) {
      out.push({
        slug: `${model.slug}-on-${chip.slug}`,
        model,
        dbKeys,
        chip,
      });
    }
  }
  return out;
}

const ENTRIES: readonly RunPageEntry[] = buildEntries();

const ENTRY_BY_SLUG: ReadonlyMap<string, RunPageEntry> = new Map(
  ENTRIES.map((entry) => [entry.slug, entry]),
);

export function getAllRunPageEntries(): readonly RunPageEntry[] {
  return ENTRIES;
}

export function getRunPageEntry(slug: string): RunPageEntry | undefined {
  return ENTRY_BY_SLUG.get(slug.toLowerCase());
}

export function runPagePath(entry: RunPageEntry): string {
  return `/run/${entry.slug}`;
}

export function runPageTitle(entry: RunPageEntry): string {
  return `${entry.model.seoName} on ${entry.chip.label}: Measured Inference Throughput and Cost`;
}

export function runPageHeading(entry: RunPageEntry): string {
  return `Running ${entry.model.seoName} on ${entry.chip.label}`;
}

export function runPageDescription(entry: RunPageEntry): string {
  return `Live benchmark data for ${entry.model.seoName} inference on ${entry.chip.title}: tokens per second per GPU, cost per million tokens, and the serving configs that produced them.`;
}

export function runPageKeywords(entry: RunPageEntry): string[] {
  const model = entry.model.seoName;
  const chip = entry.chip.label;
  return [
    `${model} on ${chip}`,
    `run ${model} on ${chip}`,
    `${model} ${chip} benchmark`,
    `${model} ${chip} throughput`,
    `${model} ${chip} tokens per second`,
    `${model} ${chip} cost per million tokens`,
    `${chip} ${model} inference performance`,
    `${model} inference hardware`,
  ];
}

export function runPageFaqQuestions(entry: RunPageEntry): {
  throughput: string;
  cost: string;
  serving: string;
  methodology: string;
} {
  const model = entry.model.seoName;
  const chip = entry.chip.label;
  return {
    throughput: `How fast is ${model} on ${chip}?`,
    cost: `How much does it cost to serve ${model} on ${chip}?`,
    serving: `Which serving engines run ${model} on ${chip}?`,
    methodology: `How are these ${model} numbers measured?`,
  };
}
