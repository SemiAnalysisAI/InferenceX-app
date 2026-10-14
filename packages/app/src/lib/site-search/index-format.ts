import type { Locale } from '@/lib/i18n/i18n';

/**
 * Wire format of the build-time site search index, shared by the generator
 * (`build-index.ts`, server only) and the browser engine.
 *
 * Two files per deploy:
 *
 * - `/search-index/manifest.json`: tiny, revalidated on every dialog open.
 *   Names the current content version and the per-locale index URLs.
 * - `/search-index/<version>/<locale>.json`: the pages themselves. The URL
 *   changes whenever the content does, so it is cached as immutable.
 *
 * Bump `SEARCH_INDEX_SCHEMA` on any breaking change to these shapes. A browser
 * tab running older code then sees an unknown schema and falls back to the
 * live page instead of misreading the new format.
 */
export const SEARCH_INDEX_SCHEMA = 1;

export const SEARCH_INDEX_MANIFEST_PATH = '/search-index/manifest.json';

export const SEARCH_INDEX_LOCALES = ['en', 'zh'] as const satisfies readonly Locale[];

export function searchIndexFilePath(version: string, locale: Locale): string {
  return `/search-index/${version}/${locale}.json`;
}

/**
 * How much of a page the index holds.
 *
 * - `full`: every text section the page renders.
 * - `partial`: authored sections, but live data (benchmark tables, charts)
 *   is left to the page itself.
 * - `summary`: title and meta description only; the body lives in JSX or is
 *   rendered from live data per request.
 */
export type IndexCoverage = 'full' | 'partial' | 'summary';

export interface IndexedSection {
  /** Anchor id on the rendered page, when the section has one. */
  anchor?: string;
  /** Section heading; omitted for the page intro. */
  heading?: string;
  text: string;
}

export interface IndexedPage {
  /** Site path including any `/zh` prefix, e.g. `/zh/blog/foo`. */
  url: string;
  title: string;
  coverage: IndexCoverage;
  sections: IndexedSection[];
}

export interface SearchIndexFile {
  schema: typeof SEARCH_INDEX_SCHEMA;
  version: string;
  locale: Locale;
  pages: IndexedPage[];
}

export interface SearchIndexManifestLocale {
  path: string;
  pages: number;
  sections: number;
  bytes: number;
}

export interface SearchIndexManifest {
  schema: typeof SEARCH_INDEX_SCHEMA;
  version: string;
  /** ISO timestamp of the build that produced the index. */
  generatedAt: string;
  locales: Record<Locale, SearchIndexManifestLocale>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates an untrusted manifest body; returns null for anything unexpected. */
export function parseSearchIndexManifest(value: unknown): SearchIndexManifest | null {
  if (!isRecord(value) || value.schema !== SEARCH_INDEX_SCHEMA) return null;
  if (typeof value.version !== 'string' || typeof value.generatedAt !== 'string') return null;
  if (!isRecord(value.locales)) return null;
  for (const locale of SEARCH_INDEX_LOCALES) {
    const entry = value.locales[locale];
    if (!isRecord(entry) || typeof entry.path !== 'string' || !entry.path.startsWith('/')) {
      return null;
    }
  }
  return value as unknown as SearchIndexManifest;
}

const COVERAGE = new Set<unknown>(['full', 'partial', 'summary']);

/**
 * Validates an untrusted index body against the expected version and locale.
 * Malformed pages are dropped individually; a wrong schema, version or locale
 * rejects the whole file so a stale cached copy is never mixed in.
 */
export function parseSearchIndexFile(
  value: unknown,
  expected: { version: string; locale: Locale },
): SearchIndexFile | null {
  if (!isRecord(value) || value.schema !== SEARCH_INDEX_SCHEMA) return null;
  if (value.version !== expected.version || value.locale !== expected.locale) return null;
  if (!Array.isArray(value.pages)) return null;
  const pages: IndexedPage[] = [];
  for (const page of value.pages) {
    if (!isRecord(page) || typeof page.url !== 'string' || !page.url.startsWith('/')) continue;
    if (typeof page.title !== 'string' || !COVERAGE.has(page.coverage)) continue;
    if (!Array.isArray(page.sections)) continue;
    const sections = page.sections.filter(
      (section): section is IndexedSection =>
        isRecord(section) &&
        typeof section.text === 'string' &&
        (section.anchor === undefined || typeof section.anchor === 'string') &&
        (section.heading === undefined || typeof section.heading === 'string'),
    );
    if (sections.length === 0) continue;
    pages.push({
      url: page.url,
      title: page.title,
      coverage: page.coverage as IndexCoverage,
      sections,
    });
  }
  return { schema: SEARCH_INDEX_SCHEMA, version: expected.version, locale: expected.locale, pages };
}
