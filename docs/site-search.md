# Site Search

The header magnifying glass (also `Cmd/Ctrl+K` or `/`) opens a client-only search over the
site's pages. There is no search backend, API route, or build-time index.

## How results are produced

1. **Live page.** When the dialog opens, the page on screen is split into heading-delimited
   sections from the live DOM and indexed immediately.
2. **Seeds.** `/llms.txt` (about 20 KB, CDN-cached) lists every curated page with a title and
   summary. Each entry becomes a `seed` doc, so the whole site is searchable at the metadata
   level within one request. Seed results carry a "Summary" badge.
3. **Progressive crawl.** While the dialog stays open, primary dashboard tabs, core pages and
   the llms.txt pages are fetched two at a time and parsed with an inert `DOMParser` during idle
   time. Each page's sections replace its seed doc and results refresh live. Pages whose seed
   metadata matches the current query are fetched first.

The index is in memory for the tab's lifetime, one per locale. `/zh` sessions crawl `/zh`
siblings where they exist.

## Ranking

`src/lib/site-search/search-index.ts` is a small BM25F index:

- Headings are weighted 3x over body text.
- The word being typed completes by prefix; a finished word (trailing space) does not.
- Words of five or more characters tolerate one typo.
- Concept groups in `concepts.ts` give semantic reach without an embedding model: "energy"
  matches power and J/token content, "cheapest" matches TCO. Concept-only matches score lower
  and earn partial coverage credit, so literal matches of every query term rank first.
- At most two sections per page are shown, and each URL appears once.
- Results are ordered by page type (`page-tiers.ts`): main pages (landing, AgentX, every
  dashboard tab, About, uBenchX) first, then reference pages (chips, comparisons, rankings,
  models, glossary), then Overview, then articles (blog and whitepapers). Tier ordering applies
  only to results scoring at least 25% of the best match; weaker matches follow in score order,
  so a barely related main page cannot outrank a strong article match.

Chinese text is indexed as character bigrams. Concept groups include Chinese members.

We chose this over an in-browser embedding model because a small sentence-embedding model
plus its WASM runtime is tens of megabytes, which conflicts with the performance budget. If
we revisit, load it only after the user opts in, and rerank the lexical top results rather
than embedding every section.

## Performance and SEO guarantees

- The header ships only the button and a keydown listener. The dialog, index and extractor are
  a separate chunk, loaded on first open and warmed on hover or focus.
  `site-search-imports.test.ts` guards this.
- Nothing is fetched until the user opens search. Crawling pauses (in-flight requests abort)
  when the dialog closes, stops at 160 pages, and is disabled when Data Saver is on.
- Crawled HTML is parsed into an inert document: no scripts run, no subresources load, no
  analytics fire.
- The server-rendered HTML gains one `<button>` with an `aria-label`. No links, routes, or
  metadata change, and no `SearchAction` structured data is emitted, because there is no
  search results URL to point crawlers at.

## Extraction rules

`extract.ts` reads `<main>` (falling back to `<body>`), skips `header`, `footer`, `nav`,
controls, `svg`/`canvas` charts, `aria-hidden` subtrees and anything marked
`data-site-search-ignore`, and uses heading `id`s (or an enclosing `section[id]`) as result
anchors. Give new long-form headings stable `id`s so results can deep-link to them.

## API coverage exclusion

Site search is presentation-only navigation over already public page text. It adds no data
selector, filter, unit, or calculation, so it has no `/api/v1/views` or
`@semianalysisai/inferencex-skills` counterpart. See
[Dashboard Read-only Views](./dashboard-readonly-views.md).

## Analytics

`header_search_opened` (`method`: `click` or `shortcut`), `header_search_queried` (settled
query and result count), `header_search_result_clicked` (`rank`, `source`, `url`) and
`header_search_example_clicked`.
