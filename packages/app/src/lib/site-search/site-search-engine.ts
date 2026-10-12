import { SITE_URL } from '@semianalysisai/inferencex-constants';

import { hasZhSibling, type Locale, zhPath } from '@/lib/i18n/i18n';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';

import { pageTier } from './page-tiers';
import { extractSections, parseLlmsTxt, type SeedPage } from './extract';
import { type SearchResult, SiteSearchIndex } from './search-index';
import { tokenize } from './tokenize';

/**
 * Progressive, client-only site search.
 *
 * 1. The page on screen is indexed from the live DOM the moment search opens.
 * 2. `/llms.txt` (about 20 KB, CDN-cached) seeds every curated page's title and
 *    summary, so the whole site is searchable at the metadata level at once.
 * 3. While the dialog is open, pages are fetched two at a time, parsed with an
 *    inert `DOMParser` during idle time, and their sections replace the seed.
 *    Pages that best match the current query are fetched first.
 *
 * Nothing runs until the user opens search, crawling pauses when it closes,
 * and Data Saver disables step 3. The index lives in memory for the tab's
 * lifetime, so client-side navigation keeps everything already indexed.
 */

export interface SiteSearchStatus {
  /** Pages whose full content is indexed (fetched or live DOM). */
  indexedPages: number;
  /** Pages known to the index, fetched or not. */
  totalPages: number;
  /** True while background fetching is active. */
  crawling: boolean;
  /** True once the llms.txt seed list has loaded (or failed). */
  seeded: boolean;
  /** Incremented on every index change so subscribers can re-run queries. */
  version: number;
}

type Listener = (status: SiteSearchStatus) => void;

const CONCURRENCY = 2;
const MAX_CRAWLED_PAGES = 160;
// Indexing a single HTML response well under this is typical; larger pages
// (the API reference) are still fine but bigger ones are not worth parsing.
const MAX_HTML_BYTES = 2_500_000;

/** Core destinations crawled first so primary navigation is fully searchable. */
const CORE_PATHS = ['/', '/agentx', '/overview', '/about', '/blog', '/ubenchx'];

function localize(path: string, locale: Locale): string {
  if (locale !== 'zh') return path;
  return hasZhSibling(path) ? zhPath(path) : path;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 16);
    }
  });
}

function saveDataEnabled(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export class SiteSearchEngine {
  readonly index = new SiteSearchIndex(pageTier);
  private readonly locale: Locale;
  private readonly fetchImpl: typeof fetch;
  private queue: string[] = [];
  private queued = new Set<string>();
  private crawled = new Set<string>();
  private seeds = new Map<string, SeedPage>();
  private listeners = new Set<Listener>();
  private active = 0;
  private running = false;
  private seeded = false;
  private seeding: Promise<void> | null = null;
  private controllers = new Set<AbortController>();
  private version = 0;

  constructor(locale: Locale, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    this.locale = locale;
    this.fetchImpl = fetchImpl;
  }

  status(): SiteSearchStatus {
    const known = new Set([...this.crawled, ...this.queued, ...this.seeds.keys()]);
    return {
      indexedPages: this.crawled.size,
      totalPages: Math.max(known.size, this.crawled.size),
      crawling: this.running && (this.active > 0 || this.queue.length > 0),
      seeded: this.seeded,
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
    this.index.replacePages(docs);
    this.crawled.add(path);
    this.dequeue(path);
    this.emit();
  }

  private enqueue(path: string): void {
    if (this.crawled.has(path) || this.queued.has(path)) return;
    if (this.crawled.size + this.queued.size >= MAX_CRAWLED_PAGES) return;
    this.queued.add(path);
    this.queue.push(path);
  }

  private dequeue(path: string): void {
    if (!this.queued.delete(path)) return;
    this.queue = this.queue.filter((p) => p !== path);
  }

  /** Load the llms.txt seed list once; failures leave the live-page index usable. */
  seed(): Promise<void> {
    this.seeding ??= (async () => {
      for (const route of DASHBOARD_ROUTES) {
        if (route.indexable && route.navGroup === 'primary') {
          this.enqueue(localize(route.path, this.locale));
        }
      }
      for (const path of CORE_PATHS) this.enqueue(localize(path, this.locale));
      try {
        const res = await this.fetchImpl('/llms.txt');
        if (res.ok) {
          const origins = [SITE_URL, window.location.origin];
          const pages = parseLlmsTxt(await res.text(), origins);
          for (const page of pages) {
            const path = localize(page.path, this.locale);
            this.seeds.set(path, { ...page, path });
            if (!this.index.hasPage(path)) {
              this.index.add({
                url: path,
                pageTitle: page.title,
                text: [page.description, page.group].filter(Boolean).join(' · '),
                source: 'seed',
              });
            }
            this.enqueue(path);
          }
        }
      } catch {
        // Offline or blocked: search still covers the live page and core paths.
      }
      this.seeded = true;
      this.emit();
    })();
    return this.seeding;
  }

  /**
   * Move pages whose seed metadata matches the query to the front of the
   * queue, so the pages most likely to answer it are fetched next.
   */
  prioritize(query: string): void {
    const terms = new Set(tokenize(query));
    if (terms.size === 0 || this.queue.length === 0) return;
    const score = (path: string) => {
      const seed = this.seeds.get(path);
      const haystack = tokenize(
        `${path.replaceAll(/[/-]/gu, ' ')} ${seed?.title ?? ''} ${seed?.description ?? ''}`,
      );
      let hits = 0;
      for (const term of haystack) {
        for (const q of terms) if (term === q || term.startsWith(q)) hits++;
      }
      return hits;
    };
    const scored = this.queue.map((path, order) => ({ path, order, hits: score(path) }));
    scored.sort((a, b) => b.hits - a.hits || a.order - b.order);
    this.queue = scored.map((entry) => entry.path);
  }

  /** Begin (or resume) background crawling. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.seed().then(() => this.pump());
    this.emit();
  }

  /** Pause crawling and abort in-flight requests; aborted pages are re-queued. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.emit();
  }

  private pump(): void {
    if (!this.running || saveDataEnabled()) return;
    while (this.active < CONCURRENCY && this.queue.length > 0) {
      const path = this.queue.shift()!;
      this.queued.delete(path);
      this.active++;
      void this.crawl(path).finally(() => {
        this.active--;
        this.emit();
        this.pump();
      });
    }
  }

  private async crawl(path: string): Promise<void> {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const res = await this.fetchImpl(path, {
        signal: controller.signal,
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('text/html')) {
        this.crawled.add(path);
        return;
      }
      const html = await res.text();
      if (html.length > MAX_HTML_BYTES) {
        this.crawled.add(path);
        return;
      }
      await idle();
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const docs = extractSections(parsed, path);
      const seed = this.seeds.get(path);
      if (docs.length > 0) {
        // Prefer the curated seed title when the page's <title> is generic.
        if (seed) for (const doc of docs) if (doc.pageTitle === path) doc.pageTitle = seed.title;
        this.index.replacePages(docs);
      }
      this.crawled.add(path);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Paused mid-flight: try again on the next open.
        this.queued.add(path);
        this.queue.unshift(path);
      } else {
        this.crawled.add(path);
      }
    } finally {
      this.controllers.delete(controller);
    }
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
