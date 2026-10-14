import { type Locale, zhPath } from '@/lib/i18n/i18n';

import { extractSections } from './extract';
import {
  type IndexedPage,
  parseSearchIndexFile,
  parseSearchIndexManifest,
  SEARCH_INDEX_MANIFEST_PATH,
  type SearchIndexManifest,
} from './index-format';
import { pageTier } from './page-tiers';
import { type SearchDoc, type SearchResult, SiteSearchIndex } from './search-index';

/**
 * Client-side site search over a build-time index.
 *
 * 1. The page on screen is indexed from the live DOM the moment search opens,
 *    so live data (benchmark tables, client-rendered panels) is searchable on
 *    the page the reader is looking at.
 * 2. The first open fetches `/search-index/manifest.json` (revalidated) and
 *    then the versioned per-locale index it names (immutable, CDN cached).
 *    Every query runs locally against that in-memory index.
 *
 * No page HTML is ever fetched. If the manifest or index is missing, stale or
 * malformed, search keeps working on the live page and the status says so.
 */

export type SiteIndexState = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface SiteSearchStatus {
  state: SiteIndexState;
  /** Pages in the loaded site index (0 until it is ready). */
  pages: number;
  /** Of those, pages indexed from their title and description only. */
  summaryPages: number;
  /** Build time of the loaded index, ISO 8601. */
  generatedAt: string | null;
  /** True once the page on screen has been indexed from the live DOM. */
  liveIndexed: boolean;
  /** Incremented on every index change so subscribers can re-run queries. */
  version: number;
}

type Listener = (status: SiteSearchStatus) => void;

/** English canonical path for a (possibly `/zh`) pathname. */
function canonicalPath(path: string): string {
  if (path === '/zh') return '/';
  return path.startsWith('/zh/') ? path.slice(3) : path;
}

function pageDocs(page: IndexedPage): SearchDoc[] {
  const source: SearchDoc['source'] = page.coverage === 'summary' ? 'summary' : 'page';
  return page.sections.map((section) => ({
    url: section.anchor ? `${page.url}#${section.anchor}` : page.url,
    pageTitle: page.title,
    section: section.heading && section.heading !== page.title ? section.heading : undefined,
    text: section.text,
    source,
  }));
}

export class SiteSearchEngine {
  readonly index = new SiteSearchIndex(pageTier);
  private readonly locale: Locale;
  private readonly fetchImpl: typeof fetch;
  private listeners = new Set<Listener>();
  private state: SiteIndexState = 'idle';
  private loading: Promise<void> | null = null;
  private manifest: SearchIndexManifest | null = null;
  private loadedPages = 0;
  private summaryPages = 0;
  /** Canonical paths indexed from the live DOM; the site index never overwrites them. */
  private livePaths = new Set<string>();
  private version = 0;

  constructor(locale: Locale, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    this.locale = locale;
    this.fetchImpl = fetchImpl;
  }

  status(): SiteSearchStatus {
    return {
      state: this.state,
      pages: this.loadedPages,
      summaryPages: this.summaryPages,
      generatedAt: this.manifest?.generatedAt ?? null,
      liveIndexed: this.livePaths.size > 0,
      version: this.version,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.version++;
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }

  search(query: string, limit?: number): SearchResult[] {
    return this.index.search(query, limit);
  }

  /** Index (or re-index) the document currently on screen. */
  indexLiveDocument(path: string, doc: Document = document): void {
    const docs = extractSections(doc, path);
    if (docs.length === 0) return;
    const canonical = canonicalPath(path);
    // The live page supersedes its indexed copy in either locale.
    this.index.removePage(canonical);
    this.index.removePage(zhPath(canonical));
    this.index.replacePages(docs);
    this.livePaths.add(canonical);
    this.emit();
  }

  /**
   * Load the site index once per tab. Safe to call on every dialog open: a
   * successful load is kept, and a failed one is retried on the next open.
   */
  load(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    this.loading ??= this.fetchIndex().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async fetchManifest(cache: RequestCache): Promise<SearchIndexManifest> {
    const res = await this.fetchImpl(SEARCH_INDEX_MANIFEST_PATH, {
      cache,
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const manifest = parseSearchIndexManifest(await res.json());
    if (!manifest) throw new Error('manifest schema');
    return manifest;
  }

  /** Returns null when the file no longer matches the manifest (a deploy happened). */
  private async fetchIndexFile(manifest: SearchIndexManifest): Promise<IndexedPage[] | null> {
    const res = await this.fetchImpl(manifest.locales[this.locale].path, {
      credentials: 'same-origin',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`index ${res.status}`);
    const file = parseSearchIndexFile(await res.json(), {
      version: manifest.version,
      locale: this.locale,
    });
    return file ? file.pages : null;
  }

  private async fetchIndex(): Promise<void> {
    this.state = 'loading';
    this.emit();
    try {
      // `no-cache` revalidates with the CDN, which answers 304 until a deploy.
      let manifest = await this.fetchManifest('no-cache');
      let pages = await this.fetchIndexFile(manifest);
      if (pages === null) {
        // The named version is gone or mismatched: a deploy replaced it after
        // the manifest was cached somewhere. Bypass caches once and retry.
        manifest = await this.fetchManifest('reload');
        pages = await this.fetchIndexFile(manifest);
      }
      if (pages === null) throw new Error('index version mismatch');
      this.apply(manifest, pages);
      this.state = 'ready';
    } catch {
      // Offline, blocked or malformed: the live page stays searchable.
      this.state = 'unavailable';
    }
    this.emit();
  }

  private apply(manifest: SearchIndexManifest, pages: readonly IndexedPage[]): void {
    const docs: SearchDoc[] = [];
    let summaries = 0;
    for (const page of pages) {
      if (page.coverage === 'summary') summaries++;
      // Keep the fresher live-DOM copy of the page on screen.
      if (this.livePaths.has(canonicalPath(page.url))) continue;
      docs.push(...pageDocs(page));
    }
    this.index.replacePages(docs);
    this.manifest = manifest;
    this.loadedPages = pages.length;
    this.summaryPages = summaries;
  }
}

const engines = new Map<Locale, SiteSearchEngine>();

/** One engine per locale for the lifetime of the tab. */
export function getSiteSearchEngine(locale: Locale): SiteSearchEngine {
  let engine = engines.get(locale);
  if (!engine) {
    engine = new SiteSearchEngine(locale);
    engines.set(locale, engine);
  }
  return engine;
}
