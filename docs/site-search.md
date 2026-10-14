# Site Search

The header magnifying glass (also `Cmd/Ctrl+K` or `/`) opens site search. The index is
generated at build time from the site's content sources and served as static, CDN-cached JSON;
every query runs locally in the browser. There is no search backend and no page HTML is
fetched by the browser.

## How results are produced

1. **Live page.** When the dialog opens, the page on screen is split into heading-delimited
   sections from the live DOM (`extract.ts`) and indexed immediately. This copy replaces the
   indexed copy of the same page, so live data on screen (benchmark tables, client-rendered
   panels) is searchable even though the build-time index does not hold it.
2. **Site index.** The first open fetches `/search-index/manifest.json`, then the per-locale
   file it names, `/search-index/<version>/<locale>.json`, and loads its sections into the
   in-memory index. Both are prerendered route handlers under `src/app/search-index/`.

The status line reports what is actually loaded: "Loading site index…", "N pages indexed · M
summary only · built <date>", or "Site index unavailable · searching this page only".

## How the index is generated

`src/lib/site-search/build-index.server.ts` builds one entry per page from the registries the
route itself renders from:

| Source                                       | Pages                                                                       | Coverage                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Blog MDX (`content/blog`, `content/blog/zh`) | `/blog/<slug>`                                                              | full, one section per `#`–`###` heading                     |
| Model MDX (`content/models`)                 | `/model/<slug>`                                                             | full                                                        |
| Glossary registries                          | `/glossary/<slug>`                                                          | full                                                        |
| Whitepaper registry                          | `/whitepaper/<slug>`                                                        | full (summary, findings, method, assumptions)               |
| AgentX optimizations                         | `/agentx/optimizations`, `/agentx/optimizations/<framework>`                | full                                                        |
| Chip catalog                                 | `/chips/<slug>`, `/chips/<a>-vs-<b>`                                        | partial: overview, specs, FAQ; live results are not indexed |
| About FAQ data                               | `/about`                                                                    | partial: FAQ plus page metadata                             |
| Page metadata                                | dashboard tabs, `/inference/<model>`, `/rankings/<slug>` and JSX-only pages | summary                                                     |

Section anchors are the ids the page renders: blog and model headings use `extractHeadings`,
the same helper as the table of contents; other adapters use the fixed ids of their components.
"Summary" pages contribute the title and description the page exports in its `metadata`, so
their search entry cannot drift from the page. Summary results carry a "Summary" badge and a
small ranking penalty, as before.

Each English page may have a Chinese variant. `en.json` holds English pages; `zh.json` holds the
Chinese variant where one renders and the English page otherwise, so `/zh` sessions never link
a 404.

### Versioning and caching

- The version is a 16-hex SHA-256 of both locale files (plus the schema number). The same
  sources always produce the same version, so the manifest and file routes agree even when
  Next prerenders them in different workers.
- `manifest.json`: `Cache-Control: public, max-age=0, must-revalidate`. Browsers revalidate it on
  each first open per tab; the CDN copy is replaced on deploy.
- `<version>/<locale>.json`: `Cache-Control: public, max-age=31536000, immutable`. Only the
  current version is generated (`dynamicParams = false`); any other version is a 404.
- `SEARCH_INDEX_SCHEMA` in `index-format.ts` is bumped on any breaking format change. A tab
  running older code that sees a newer schema treats the index as unavailable.
- Both responses send `X-Robots-Tag: noindex`.

Size at the time of writing: about 360 pages per locale, roughly 380 KB (en) and 420 KB (zh)
gzipped. `build-index.server.test.ts` fails above 600 KB gzipped per locale.

### Refresh strategy

- **Content changes ship with deploys.** Every page in the index is rendered from repository
  content or from metadata that only changes in a deploy, so regenerating the index on every
  build (including the scheduled rebuilds) keeps it in step with the HTML.
- **Live data is not indexed.** Pages that render database results per request (comparisons,
  run pages, rankings, chip benchmark tables, AgentX datasets) contribute only their stable
  title and description, never numbers that would go stale between deploys. The live-DOM pass
  indexes those numbers on the page the reader is looking at.
- **Tabs that outlive a deploy.** If the manifest names a version that no longer exists (404),
  or the file's version does not match, the engine refetches the manifest once with
  `cache: 'reload'` and loads the new version. If that still fails, search stays on the live
  page and says so. A failed load retries on the next open; a loaded index is kept for the tab.

### Pages not fully indexed at build time

Summary only (title and description): every dashboard tab, `/inference/<model>`,
`/rankings` and `/rankings/<slug>`, `/run`, the `/compare*` landing pages, `/overview`,
`/agentx`, `/agentx/methodology`, `/agentx/quickstart`, `/agentx/telemetry`,
`/inference/agentic`, `/api`, `/ubenchx/*`, `/quotes`, `/land-acknowledgement`, and the
blog, chips, glossary, model and whitepaper index pages. Their prose lives in JSX, or their
body is live data.

Partial: chip and chip-versus pages (live benchmark tables) and `/about` (JSX hero and
sections other than the FAQ).

Not indexed: routes listed in `src/lib/site-search/coverage.ts` with their reason, mainly
per-request comparison, run, dataset and trace pages, filtered dashboard views, feature-gated
tabs, embeds and redirects. A test fails when a new `page.tsx` is neither indexed nor listed
there.

To index a JSX-only page fully, move its copy into a data module (as the AgentX optimizations
and whitepapers do) and add an adapter in `build-index.server.ts`.

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
  models, glossary), then Overview, then articles (blog, whitepapers and the per-framework AgentX optimization write-ups). Tier ordering applies
  only to results scoring at least 25% of the best match; weaker matches follow in score order,
  so a barely related main page cannot outrank a strong article match.

Chinese text is indexed as character bigrams. Concept groups include Chinese members.

We chose this over an in-browser embedding model because a small sentence-embedding model
plus its WASM runtime is tens of megabytes, which conflicts with the performance budget. If
we revisit, load it only after the user opts in, and rerank the lexical top results rather
than embedding every section.

## Performance and SEO guarantees

- The header ships only the button and a keydown listener. The dialog, engine and extractor
  are a separate chunk, loaded on first open and warmed on hover or focus. The generator never
  reaches the client. `site-search-imports.test.ts` guards both.
- Nothing is fetched until the user opens search: one revalidated manifest request and one
  cached index file per tab.
- Search engine indexing of page HTML is a separate concern. Site search adds one `<button>`
  with an `aria-label` to the server-rendered HTML and changes no links, metadata, sitemap or
  robots rules. The index JSON is `noindex`, and no `SearchAction` structured data is emitted,
  because there is no search results URL to point crawlers at.

## Extraction rules

For the live page, `extract.ts` reads `<main>` (falling back to `<body>`), skips `header`, `footer`, `nav`,
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
query and result count), `header_search_result_clicked` (`rank`, `source`: `page` or `summary`, `url`) and
`header_search_example_clicked`.
