/**
 * @file run-pages.ts
 * @description Slug registry and copy builders for the indexable
 * `/run/<model>-on-<chip>` pages.
 *
 * Each page answers one search-shaped question: what does it actually look
 * like to serve model X on GPU Y today? The dashboard already measures the
 * answer daily; these pages give every (model, chip) pair a stable URL with
 * its own title, meta description, and server-rendered numbers so the
 * measurement is indexable instead of trapped behind dashboard query params.
 *
 * The vocabulary deliberately reuses the two registries that already exist:
 * model slugs come from `INFERENCE_MODEL_SLUGS` (same slugs as `/inference/…`
 * and `/compare/…`) and chip slugs come from `chip-pages.ts` (same slugs as
 * `/chips/…`), so `/run/kimi-k3-on-gb200-nvl72`, `/inference/kimi-k3` and
 * `/chips/gb200-nvl72` all agree on what the words mean. No third naming
 * scheme is introduced.
 *
 * Which pairs actually get indexed is decided by benchmark availability at
 * request time (see `run-rankings-data.server.ts`); this module only defines
 * the static candidate space and the copy.
 */

import { getAllChipPages, type ChipPageEntry } from '@/lib/chip-pages';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { INFERENCE_MODEL_SLUGS, type InferenceModelSlug } from '@/lib/inference-model-slug';

export interface RunPageEntry {
  /** Canonical URL slug under /run/, e.g. 'kimi-k3-on-gb200-nvl72'. */
  slug: string;
  /** Model registry entry — same slug vocabulary as /inference/<model>. */
  model: InferenceModelSlug;
  /** DB keys to fetch benchmark rows for, from the compare registry. */
  dbKeys: string[];
  /** Chip registry entry — same slug vocabulary as /chips/<slug>. */
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

/** Every candidate (model, chip) pair. Availability filtering happens in the
 *  server layer; unknown slugs 404 at the route. */
export function getAllRunPageEntries(): readonly RunPageEntry[] {
  return ENTRIES;
}

export function getRunPageEntry(slug: string): RunPageEntry | undefined {
  return ENTRY_BY_SLUG.get(slug.toLowerCase());
}

export function runPagePath(entry: RunPageEntry): string {
  return `/run/${entry.slug}`;
}

// ---------------------------------------------------------------------------
// English copy
// ---------------------------------------------------------------------------

export function runPageTitle(entry: RunPageEntry): string {
  return `${entry.model.seoName} on ${entry.chip.label}: Measured Inference Throughput and Cost`;
}

export function runPageHeading(entry: RunPageEntry): string {
  return `Running ${entry.model.seoName} on ${entry.chip.label}`;
}

/** Static fallback meta description; the route swaps in a stat-led one when
 *  live numbers are available. Keep ≤160 chars before the supporters line. */
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

/** Search-shaped FAQ scaffolding. Answers that need live numbers are filled
 *  by the route; these are the stable question strings. */
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
