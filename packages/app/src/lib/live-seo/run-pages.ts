import { getAllChipPages, type ChipPageEntry } from '@/lib/catalog/chip-pages';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import {
  INFERENCE_MODEL_ALIASES,
  INFERENCE_MODEL_SLUGS,
  type InferenceModelSlug,
} from '@/lib/routing/inference-model-slug';
import { fitMetaTitle } from '@/lib/seo/meta-text';

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

// Old links and guessed URLs write versions with dots or extra dashes (`deepseek-v4.1-flash`,
// `kimi-k3-1-pro`) and name chips by key (`gb300`). Letters and digits alone identify them.
const nameKey = (name: string) => name.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');

const MODEL_SLUG_BY_KEY: ReadonlyMap<string, string> = new Map([
  ...Object.entries(INFERENCE_MODEL_ALIASES).map(
    ([alias, slug]) => [nameKey(alias), slug] as const,
  ),
  ...INFERENCE_MODEL_SLUGS.flatMap((entry) =>
    [entry.slug, entry.model, entry.seoName].map((name) => [nameKey(name), entry.slug] as const),
  ),
]);

const CHIP_SLUG_BY_KEY: ReadonlyMap<string, string> = new Map(
  getAllChipPages().flatMap((chip) =>
    [chip.slug, chip.hwKey, chip.label, chip.specName].map(
      (name) => [nameKey(name), chip.slug] as const,
    ),
  ),
);

/** The current slug a respelled or renamed run URL refers to, or null when there is none. */
export function canonicalRunPageSlug(slug: string): string | null {
  const lower = slug.toLowerCase();
  const separator = lower.lastIndexOf('-on-');
  if (separator <= 0) return null;
  const model = MODEL_SLUG_BY_KEY.get(nameKey(lower.slice(0, separator)));
  const chip = CHIP_SLUG_BY_KEY.get(nameKey(lower.slice(separator + '-on-'.length)));
  return (model && chip && ENTRY_BY_SLUG.get(`${model}-on-${chip}`)?.slug) || null;
}

export function runPagePath(entry: RunPageEntry): string {
  return `/run/${entry.slug}`;
}

export function runPageTitle(entry: RunPageEntry): string {
  const base = `${entry.model.seoName} on ${entry.chip.label}`;
  return fitMetaTitle([`${base}: Throughput and Cost`, `${base}: Benchmarks`, base]);
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
