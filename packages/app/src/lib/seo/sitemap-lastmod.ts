import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';

export interface DataDateRow {
  model: string;
  hardware: string;
  date: string;
}

export interface DataLastModified {
  /** Latest benchmark date across every model, or undefined when no rows exist. */
  latest: string | undefined;
  forModel: (modelSlug: string) => string | undefined;
  forModelChips: (modelSlug: string, chips: readonly string[]) => string | undefined;
}

function toIso(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toISOString();
}

function later(a: string | undefined, b: string): string {
  return a === undefined || b > a ? b : a;
}

/** Builds sitemap lastmod lookups from benchmark availability dates (YYYY-MM-DD). */
export function dataLastModified(rows: readonly DataDateRow[]): DataLastModified {
  const slugByDbKey = new Map<string, string>();
  for (const model of COMPARE_MODEL_SLUGS) {
    for (const dbKey of model.dbKeys) slugByDbKey.set(dbKey, model.slug);
  }
  let latest: string | undefined;
  const byModel = new Map<string, string>();
  const byModelChip = new Map<string, string>();
  for (const row of rows) {
    if (!row.date) continue;
    latest = later(latest, row.date);
    const slug = slugByDbKey.get(row.model);
    if (!slug) continue;
    byModel.set(slug, later(byModel.get(slug), row.date));
    const key = `${slug}|${row.hardware}`;
    byModelChip.set(key, later(byModelChip.get(key), row.date));
  }
  return {
    latest: latest && toIso(latest),
    forModel: (modelSlug) => {
      const date = byModel.get(modelSlug);
      return date && toIso(date);
    },
    forModelChips: (modelSlug, chips) => {
      let date: string | undefined;
      for (const chip of chips) {
        const chipDate = byModelChip.get(`${modelSlug}|${chip}`);
        if (chipDate) date = later(date, chipDate);
      }
      return date && toIso(date);
    },
  };
}
