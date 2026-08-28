[English](./2026-08-28-zh-model-pages-design.md) | [中文](./2026-08-28-zh-model-pages-design_zh.md)

# [11/N] Chinese Model Pages Design

## Status

Approved in conversation on 2026-08-28. This design adds the missing Chinese model index and detail-page surfaces while deliberately deferring translation of the long-form model deep dives.

## Problem

InferenceX currently exposes `/model` and `/model/[slug]` only in English. This leaves two indexable route templates without `/zh` siblings, prevents the language switcher from preserving the current route, and leaves model-page chrome and metadata outside the Chinese rollout tracked by issue #823.

The model catalog currently contains 12 English MDX deep dives. Translating those articles is a separate editorial project and is explicitly out of scope for this rollout item.

## Goals

- Add `/zh/model` and `/zh/model/[slug]` for every published model slug.
- Translate all index and detail-page chrome, metadata, breadcrumbs, notices, links, accessibility labels, empty/loading/error states touched by these routes, and all model-card summaries.
- Keep model names, developer names, hardware/model identifiers, architecture acronyms, parameter counts, units, and benchmark data unchanged.
- Keep the existing English routes and English MDX source bytes unchanged.
- Make route switching, aliases, canonical URLs, hreflang, Open Graph locale, JSON-LD, and sitemap entries bidirectional.
- Verify desktop and narrow mobile layouts with real index-to-detail navigation.

## Non-goals

- Translating the 12 long-form files under `packages/app/content/models/`.
- Rewriting technical claims or changing model architecture data.
- Changing benchmark queries, chart calculations, or dashboard defaults.
- Claiming that the long-form Chinese editorial rollout is complete.

## User experience

### Model index

`/zh/model` mirrors the English index layout. It uses natural Chinese for the page title, description, breadcrumb, release label, card summaries, and relevant accessibility text. Model titles, developer names, MoE/Dense terminology, attention mechanisms, and parameter counts retain their established technical forms. Every card links to `/zh/model/[slug]`.

### Model detail

`/zh/model/[slug]` localizes the breadcrumb, summary, release label, architecture section chrome, live-performance heading and description, dashboard link, and metadata. The architecture diagram and embedded dashboard receive `locale="zh"` through their existing locale-aware interfaces or narrowly scoped additions that preserve exact English defaults.

The untranslated MDX body remains visible so the Chinese route is still useful. It is preceded by a Chinese notice explaining that the deep dive is currently available only in English, with a direct link to the canonical English page. The article wrapper carries `lang="en"`; all surrounding page chrome remains in the Chinese document language. The English MDX is compiled from the existing source without translation, transformation, or duplication.

Alias redirects remain inside the active locale: `/zh/model/<alias>` redirects to `/zh/model/<canonical-slug>`.

## Data and component design

1. Add a slug-keyed Chinese model metadata catalog containing the translated `description` used by the index cards, detail summary, metadata, and JSON-LD. Titles, developers, dates, and identifiers continue to come from the canonical English frontmatter.
2. Add a completeness test requiring one Chinese summary for every value returned by `getModelPageSlugs()`, with no orphan keys.
3. Extract or parameterize shared model index/detail rendering so English keeps its exact current strings and Chinese selects a page-local dictionary. Avoid separate layout implementations that can drift.
4. Pass `locale` explicitly to client-side model components that render visible chrome. English remains the default only where doing so is necessary for backward compatibility.
5. Keep the English MDX loader as the sole long-form source. Chinese page code may render it only inside the explicitly labeled English section.

## Routing and metadata

- Register `/model` as a mirrored route in `ZH_MIRRORED_ROUTES`.
- Change English index and detail metadata from English-only canonicals to `enAlternates(...)`.
- Use `zhAlternates(...)` and `openGraph.locale = zh_CN` on Chinese routes.
- Localize Chinese metadata titles/descriptions and JSON-LD presentation fields while preserving protected model facts and URLs.
- Add `inLanguage` where applicable and keep breadcrumb URLs locale-correct.
- Convert `/model` and every published model slug in the sitemap to `localizedPair(...)`.
- Reuse the established English model OG artwork unless a CJK-safe renderer already exists; metadata must not claim a localized image that cannot render Chinese glyphs.

## English-preservation contract

- Existing `/model` and `/model/[slug]` visible English strings must remain byte-identical.
- English metadata wording, aliases, links, and dashboard query parameters must remain unchanged apart from adding bidirectional hreflang.
- English MDX files must remain byte-identical.
- Tests compare the English dictionaries/output contracts directly rather than relying on visual inspection alone.

## Testing

### Unit and metadata tests

- Chinese summary catalog covers exactly all published model slugs.
- English and Chinese index/detail metadata have correct canonical, hreflang, Open Graph locale, and protected model facts.
- English copy stays exact; Chinese copy contains no leaked page-chrome strings.
- Locale-aware link and alias helpers preserve `/zh` correctly.
- The Chinese article notice exists and the compiled body is marked `lang="en"`.
- Sitemap and mirrored-route registries include the model index and all detail pages.

### Browser tests

- Extend the existing model-page specification rather than creating an unnecessary timing shard unless isolation materially improves reliability.
- Exercise English and Chinese index-to-detail click journeys.
- Verify locale-switch links, canonical/hreflang metadata, Chinese dashboard links, the English-body notice, and architecture/dashboard rendering.
- Cover 1440px desktop and both 375px and 390px mobile widths with no document-level horizontal overflow.
- Run affected integration specs in Chrome and Firefox and component tests where shared client chrome changes.
- If test distribution changes materially, regenerate `packages/app/timings.json` only from an observed full `SPLIT=1` run.

## Editorial review

Every new Chinese string receives the repository `review-zh-copy` fidelity and naturalness review. The review checks each translated summary against its English frontmatter, reads the rendered sentence in context, and preserves model names, facts, dates, acronyms, links, and units. Automated CI is used only for objective invariants, not as evidence that the Chinese is fluent.

## Delivery

- Branch: `feat/zh-model-pages`
- Draft PR title: `[11/N] fix(zh): localize model page chrome and metadata / 本地化模型页面界面与元数据`
- Roadmap: link the Draft PR from issue #823 without marking the item complete until human review and runtime checks pass.
- The PR description must state plainly that long-form model article translation remains deferred.
