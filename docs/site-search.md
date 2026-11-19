# Site Search

The header magnifying glass (also `Cmd/Ctrl+K` or `/`) opens a client-only search over the
site's pages. There is no search backend, API route, or build-time index.

## How results are produced

1. **Live page.** When the dialog opens, the page on screen is split into heading-delimited
   sections from the live DOM and indexed immediately.
2. **Seeds.** `/llms.txt` lists every curated page with a title and summary. Each entry becomes
   a `seed` doc, so the whole site is searchable at the metadata level within one request.
3. **Progressive crawl.** While the dialog stays open, primary dashboard tabs, core pages and
   the llms.txt pages are fetched and parsed with an inert `DOMParser` during idle time. Each
   page's sections replace its seed doc. Pages whose seed metadata matches the current query
   are fetched first.

The index is in memory for the tab's lifetime, one per locale. Pages are queued and seeded by
their English path, which always exists. `/zh` sessions try the `/zh` sibling first and link it
only after it loads; `hasZhSibling` is a route-family check, so untranslated members such as
some blog posts fall back to the English page instead of linking a 404.

## Ranking

`src/lib/site-search/search-index.ts` is a small lexical BM25F index, and concept groups in
`concepts.ts` give it semantic reach. We chose this over an in-browser embedding model because a
small sentence-embedding model plus its WASM runtime is tens of megabytes, which conflicts with
the performance budget. If we revisit, load it only after the user opts in, and rerank the
lexical top results rather than embedding every section.

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

`extract.ts` skips page chrome, controls, charts and anything marked `data-site-search-ignore`,
and anchors results to heading `id`s (or an enclosing `section[id]`). Give new long-form
headings stable `id`s so results can deep-link to them.

## API coverage exclusion

Site search is presentation-only navigation over already public page text. It adds no data
selector, filter, unit, or calculation, so it has no `/api/v1/views` or
`@semianalysisai/inferencex-skills` counterpart.
