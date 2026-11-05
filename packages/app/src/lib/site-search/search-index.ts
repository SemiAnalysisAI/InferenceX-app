import { relatedTerms } from './concepts';
import { isCjkTerm, tokenize } from './tokenize';

export interface SearchDoc {
  url: string;
  pageTitle: string;
  section?: string;
  text: string;
  source: 'seed' | 'page';
}

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface SearchResult {
  url: string;
  pageTitle: string;
  section?: string;
  snippet: SnippetPart[];
  score: number;
  source: SearchDoc['source'];
}

interface Posting {
  title: number;
  body: number;
}

interface StoredDoc extends SearchDoc {
  page: string;
  titleLength: number;
  bodyLength: number;
  alive: boolean;
}

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;
const BODY_WEIGHT = 1;
const PREFIX_WEIGHT = 0.7;
const FUZZY_WEIGHT = 0.5;
const CONCEPT_WEIGHT = 0.45;
const CONCEPT_COVERAGE = 0.6;
const MAX_PREFIX_EXPANSIONS = 24;
const SNIPPET_WORDS = 28;
const SEED_PENALTY = 0.8;
const RELEVANCE_FLOOR = 0.25;

export function pagePath(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

export function boundedEditDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

export class SiteSearchIndex {
  private docs: StoredDoc[] = [];
  private postings = new Map<string, Map<number, Posting>>();
  private pageDocs = new Map<string, number[]>();
  private totalTitleLength = 0;
  private totalBodyLength = 0;
  private aliveCount = 0;
  private sortedTerms: string[] | null = null;
  private readonly tierOf: (url: string) => number;

  constructor(tierOf: (url: string) => number = () => 0) {
    this.tierOf = tierOf;
  }

  get size(): number {
    return this.aliveCount;
  }

  get pageCount(): number {
    return this.pageDocs.size;
  }

  hasPage(page: string, source?: SearchDoc['source']): boolean {
    const ids = this.pageDocs.get(page);
    if (!ids) return false;
    return source ? ids.some((id) => this.docs[id].source === source) : true;
  }

  removePage(page: string): void {
    const ids = this.pageDocs.get(page);
    if (!ids) return;
    for (const id of ids) {
      const doc = this.docs[id];
      if (!doc.alive) continue;
      doc.alive = false;
      this.aliveCount--;
      this.totalTitleLength -= doc.titleLength;
      this.totalBodyLength -= doc.bodyLength;
    }
    this.pageDocs.delete(page);
  }

  replacePages(docs: readonly SearchDoc[]): void {
    for (const page of new Set(docs.map((doc) => pagePath(doc.url)))) this.removePage(page);
    for (const doc of docs) this.add(doc);
  }

  add(doc: SearchDoc): void {
    const titleTerms = tokenize(`${doc.pageTitle} ${doc.section ?? ''}`);
    const bodyTerms = tokenize(doc.text);
    if (titleTerms.length === 0 && bodyTerms.length === 0) return;
    const id = this.docs.length;
    const page = pagePath(doc.url);
    this.docs.push({
      ...doc,
      page,
      titleLength: titleTerms.length,
      bodyLength: bodyTerms.length,
      alive: true,
    });
    this.aliveCount++;
    this.totalTitleLength += titleTerms.length;
    this.totalBodyLength += bodyTerms.length;
    const ids = this.pageDocs.get(page) ?? [];
    ids.push(id);
    this.pageDocs.set(page, ids);

    const bump = (term: string, field: keyof Posting) => {
      let byDoc = this.postings.get(term);
      if (!byDoc) {
        byDoc = new Map();
        this.postings.set(term, byDoc);
        this.sortedTerms = null;
      }
      const posting = byDoc.get(id) ?? { title: 0, body: 0 };
      posting[field]++;
      byDoc.set(id, posting);
    };
    for (const term of titleTerms) bump(term, 'title');
    for (const term of bodyTerms) bump(term, 'body');
  }

  private vocabulary(): string[] {
    this.sortedTerms ??= [...this.postings.keys()].sort();
    return this.sortedTerms;
  }

  private completions(prefix: string): string[] {
    const vocab = this.vocabulary();
    let lo = 0;
    let hi = vocab.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vocab[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let i = lo; i < vocab.length && out.length < MAX_PREFIX_EXPANSIONS; i++) {
      if (!vocab[i].startsWith(prefix)) break;
      if (vocab[i] !== prefix) out.push(vocab[i]);
    }
    return out;
  }

  private typoMatches(term: string): string[] {
    if (term.length < 5 || isCjkTerm(term)) return [];
    const out: string[] = [];
    for (const candidate of this.vocabulary()) {
      if (candidate[0] !== term[0] || Math.abs(candidate.length - term.length) > 1) continue;
      if (candidate !== term && boundedEditDistance(term, candidate, 1) <= 1) out.push(candidate);
    }
    return out;
  }

  private expand(query: string): Map<string, number>[] {
    const terms = [...new Set(tokenize(query))];
    const typingLast = !/\s$/u.test(query);
    return terms.map((term, index) => {
      const weights = new Map<string, number>();
      const set = (t: string, w: number) => {
        if ((weights.get(t) ?? 0) < w) weights.set(t, w);
      };
      if (this.postings.has(term)) set(term, 1);
      if (index === terms.length - 1 && typingLast && !isCjkTerm(term)) {
        for (const t of this.completions(term)) set(t, PREFIX_WEIGHT);
      }
      if (!this.postings.has(term)) for (const t of this.typoMatches(term)) set(t, FUZZY_WEIGHT);
      for (const t of relatedTerms(term)) if (this.postings.has(t)) set(t, CONCEPT_WEIGHT);
      return weights;
    });
  }

  search(query: string, limit = 20, perPage = 2): SearchResult[] {
    const expanded = this.expand(query);
    if (expanded.length === 0 || this.aliveCount === 0) return [];
    const avgTitle = this.totalTitleLength / this.aliveCount || 1;
    const avgBody = this.totalBodyLength / this.aliveCount || 1;
    const scores = new Map<number, number>();
    const coverage = new Map<number, number>();
    const matchedTerms = new Map<number, Set<string>>();

    for (const weights of expanded) {
      const best = new Map<number, number>();
      const credit = new Map<number, number>();
      for (const [term, weight] of weights) {
        const byDoc = this.postings.get(term);
        if (!byDoc) continue;
        let df = 0;
        for (const id of byDoc.keys()) if (this.docs[id].alive) df++;
        if (df === 0) continue;
        const idf = Math.log(1 + (this.aliveCount - df + 0.5) / (df + 0.5));
        for (const [id, posting] of byDoc) {
          const doc = this.docs[id];
          if (!doc.alive) continue;
          const tf =
            (TITLE_WEIGHT * posting.title) / (1 - B + (B * doc.titleLength) / avgTitle) +
            (BODY_WEIGHT * posting.body) / (1 - B + (B * doc.bodyLength) / avgBody);
          const score = weight * idf * ((tf * (K1 + 1)) / (tf + K1));
          if (score > (best.get(id) ?? 0)) best.set(id, score);
          const c = weight > CONCEPT_WEIGHT ? 1 : CONCEPT_COVERAGE;
          if (c > (credit.get(id) ?? 0)) credit.set(id, c);
          const matched = matchedTerms.get(id) ?? new Set();
          matched.add(term);
          matchedTerms.set(id, matched);
        }
      }
      for (const [id, score] of best) {
        scores.set(id, (scores.get(id) ?? 0) + score);
        coverage.set(id, (coverage.get(id) ?? 0) + (credit.get(id) ?? 1));
      }
    }

    const ranked = [...scores]
      .map(([id, score]) => {
        const doc = this.docs[id];
        const covered = (coverage.get(id) ?? 0) / expanded.length;
        const final = score * covered ** 2 * (doc.source === 'seed' ? SEED_PENALTY : 1);
        return { id, score: final };
      })
      .sort((a, b) => b.score - a.score);

    const perPageCount = new Map<string, number>();
    const seenUrls = new Set<string>();
    const picked: { id: number; score: number }[] = [];
    for (const entry of ranked) {
      const doc = this.docs[entry.id];
      const count = perPageCount.get(doc.page) ?? 0;
      if (count >= perPage || seenUrls.has(doc.url)) continue;
      seenUrls.add(doc.url);
      perPageCount.set(doc.page, count + 1);
      picked.push(entry);
    }

    const floor = (picked[0]?.score ?? 0) * RELEVANCE_FLOOR;
    const tierOrdered = picked
      .map((entry) => ({ ...entry, tier: this.tierOf(this.docs[entry.id].page) }))
      .sort((a, b) => {
        const aRelevant = a.score >= floor;
        const bRelevant = b.score >= floor;
        if (aRelevant !== bRelevant) return aRelevant ? -1 : 1;
        if (aRelevant && a.tier !== b.tier) return a.tier - b.tier;
        return b.score - a.score;
      });

    const results: SearchResult[] = [];
    for (const { id, score } of tierOrdered) {
      const doc = this.docs[id];
      results.push({
        url: doc.url,
        pageTitle: doc.pageTitle,
        section: doc.section,
        snippet: buildSnippet(doc.text, matchedTerms.get(id) ?? new Set()),
        score,
        source: doc.source,
      });
      if (results.length >= limit) break;
    }
    return results;
  }
}

export function buildSnippet(text: string, matched: ReadonlySet<string>): SnippetPart[] {
  const words = text.split(/(?<sep>\s+|\p{Script=Han})/u).filter((w) => w.length > 0);
  const han = words.map((word) => isCjkTerm(word));
  const isHit = words.map((word, i) => {
    if (/^\s+$/u.test(word)) return false;
    if (han[i]) {
      return (
        (han[i + 1] === true && matched.has(word + words[i + 1])) ||
        (han[i - 1] === true && matched.has(words[i - 1] + word)) ||
        matched.has(word)
      );
    }
    return tokenize(word, true).some((term) => matched.has(term));
  });
  const wordIndexes = words.flatMap((word, i) => (/^\s+$/u.test(word) ? [] : [i]));
  if (wordIndexes.length === 0) return [];
  const hanShare = wordIndexes.filter((i) => han[i]).length / wordIndexes.length;
  const windowSize = hanShare > 0.5 ? SNIPPET_WORDS * 2 : SNIPPET_WORDS;

  let bestStart = 0;
  let bestHits = -1;
  for (let s = 0; s < wordIndexes.length; s++) {
    let hits = 0;
    for (let k = s; k < Math.min(s + windowSize, wordIndexes.length); k++) {
      if (isHit[wordIndexes[k]]) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestStart = s;
    }
    if (s + windowSize >= wordIndexes.length) break;
  }
  let firstHit = bestStart;
  while (firstHit < wordIndexes.length - 1 && !isHit[wordIndexes[firstHit]]) firstHit++;
  if (!isHit[wordIndexes[firstHit]]) firstHit = 0;
  const startWord = Math.max(0, firstHit - 3);
  const endWord = Math.min(wordIndexes.length, startWord + windowSize);
  const from = wordIndexes[startWord];
  const to = wordIndexes[endWord - 1];

  const parts: SnippetPart[] = [];
  if (startWord > 0) parts.push({ text: '… ', hit: false });
  for (let i = from; i <= to; i++) {
    const last = parts.at(-1);
    if (last && last.hit === isHit[i] && last.text !== '… ') last.text += words[i];
    else parts.push({ text: words[i], hit: isHit[i] });
  }
  if (endWord < wordIndexes.length) parts.push({ text: ' …', hit: false });
  return parts;
}
