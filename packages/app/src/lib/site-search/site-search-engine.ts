import { SITE_URL } from '@semianalysisai/inferencex-constants';

import { hasZhSibling, type Locale, zhPath } from '@/lib/i18n/i18n';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';

import { pageTier } from './page-tiers';
import { extractSections, parseLlmsTxt, type SeedPage } from './extract';
import { type SearchResult, SiteSearchIndex } from './search-index';
import { tokenize } from './tokenize';

export interface SiteSearchStatus {
  indexedPages: number;
  totalPages: number;
  crawling: boolean;
  seeded: boolean;
  version: number;
}

type Listener = (status: SiteSearchStatus) => void;

const CONCURRENCY = 2;
const MAX_CRAWLED_PAGES = 160;
const MAX_HTML_BYTES = 2_500_000;

const CORE_PATHS = ['/', '/agentx', '/overview', '/about', '/blog', '/ubenchx'];

function zhCandidate(path: string, locale: Locale): string | null {
  if (locale !== 'zh' || !hasZhSibling(path)) return null;
  return zhPath(path);
}

function canonicalPath(path: string): string {
  if (path === '/zh') return '/';
  return path.startsWith('/zh/') ? path.slice(3) : path;
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
  private lastQuery = '';

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

  indexLiveDocument(path: string, doc: Document = document): void {
    const docs = extractSections(doc, path);
    if (docs.length === 0) return;
    const canonical = canonicalPath(path);
    if (canonical !== path) this.index.removePage(canonical);
    this.index.replacePages(docs);
    this.crawled.add(canonical);
    this.dequeue(canonical);
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

  seed(): Promise<void> {
    this.seeding ??= (async () => {
      for (const route of DASHBOARD_ROUTES) {
        if (route.indexable && route.navGroup === 'primary') {
          this.enqueue(route.path);
        }
      }
      for (const path of CORE_PATHS) this.enqueue(path);
      try {
        const res = await this.fetchImpl('/llms.txt');
        if (res.ok) {
          const origins = [SITE_URL, window.location.origin];
          const pages = parseLlmsTxt(await res.text(), origins);
          for (const page of pages) {
            const { path } = page;
            this.seeds.set(path, page);
            if (!this.crawled.has(path) && !this.index.hasPage(path)) {
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
      } catch {}
      this.seeded = true;
      this.emit();
    })();
    return this.seeding;
  }

  prioritize(query: string): void {
    this.lastQuery = query;
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

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.seed().then(() => {
      this.prioritize(this.lastQuery);
      this.pump();
    });
    this.emit();
  }

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

  private async fetchHtml(
    url: string,
    signal: AbortSignal,
  ): Promise<{ html: string; path: string } | null> {
    const res = await this.fetchImpl(url, {
      signal,
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('text/html')) return null;
    let path = url;
    if (res.redirected && res.url) {
      const final = new URL(res.url, window.location.href);
      if (final.origin !== window.location.origin) return null;
      path = final.pathname.replace(/(?<=.)\/$/u, '');
    }
    const html = await res.text();
    return html.length > MAX_HTML_BYTES ? null : { html, path };
  }

  private async crawl(path: string): Promise<void> {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const zh = zhCandidate(path, this.locale);
      let page: { html: string; path: string } | null = null;
      if (zh) {
        page = await this.fetchHtml(zh, controller.signal);
        if (page && page.path !== zh && !page.path.startsWith(`${zh}/`)) page = null;
      }
      page ??= await this.fetchHtml(path, controller.signal);
      if (page === null) {
        this.crawled.add(path);
        return;
      }
      const { html, path: url } = page;
      const finalCanonical = canonicalPath(url);
      if (finalCanonical !== path && this.crawled.has(finalCanonical)) {
        this.crawled.add(path);
        return;
      }
      await idle();
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const docs = extractSections(parsed, url);
      const seed = this.seeds.get(path);
      if (docs.length > 0) {
        if (seed) for (const doc of docs) if (doc.pageTitle === url) doc.pageTitle = seed.title;
        if (url !== path) this.index.removePage(path);
        this.index.replacePages(docs);
      }
      this.crawled.add(path);
      if (finalCanonical !== path) {
        this.crawled.add(finalCanonical);
        this.dequeue(finalCanonical);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
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

export function getSiteSearchEngine(locale: Locale): SiteSearchEngine {
  let engine = engines.get(locale);
  if (!engine) {
    engine = new SiteSearchEngine(locale);
    engines.set(locale, engine);
  }
  return engine;
}
