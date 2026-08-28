[English](./2026-08-28-zh-model-pages.md) | [中文](./2026-08-28-zh-model-pages_zh.md)

# [11/N] Chinese Model Pages Implementation Plan

> **Execution:** Follow test-driven development. Keep the branch limited to route-owned model-page code; core chart and architecture-diagram localization remains owned by PR #836 and is verified again in the combined merge order.

**Goal:** Add localized `/zh/model` and `/zh/model/[slug]` routes with Chinese page chrome, summaries, metadata, locale-correct navigation, and an explicitly labeled inline English deep-dive body.

**Architecture:** Share server-rendered model index/detail components across locales. Keep canonical model facts and English MDX in `model-pages.ts`, add an exact slug-keyed Chinese summary catalog, and select page-owned UI copy from a locale dictionary. Route wrappers own metadata and canonical/hreflang values.

**Stack:** Next.js 16 App Router, TypeScript, React Server Components, MDX, Vitest, Cypress.

---

## Task 1: Lock catalog and copy contracts with failing tests

**Files:**

- Create: `packages/app/src/lib/model-pages-zh.ts`
- Create: `packages/app/src/lib/model-pages-zh.test.ts`
- Create: `packages/app/src/components/model/model-page-copy.test.ts`
- Modify: `packages/app/src/lib/model-pages.ts`

1. Add a test requiring the Chinese summary catalog keys to equal `getModelPageSlugs()` in both directions.
2. Add protected-field tests proving titles, developers, release dates, model display names, architecture acronyms, parameter counts, and English MDX remain canonical.
3. Add exact-English tests for every existing page-owned string and localized-output tests for Chinese labels and sentence builders.
4. Run the focused Vitest files and record the expected RED failures before adding production implementations.
5. Implement the Chinese summary catalog and typed locale copy helpers.
6. Run the focused files again and require GREEN.

## Task 2: Extract locale-aware model index rendering

**Files:**

- Create: `packages/app/src/components/model/ModelIndexContent.tsx`
- Modify: `packages/app/src/app/model/page.tsx`
- Create: `packages/app/src/app/zh/model/page.tsx`
- Test: `packages/app/src/components/model/model-page-copy.test.ts`

1. Add RED assertions for locale-correct breadcrumbs, headings, card descriptions, release labels, card hrefs, and JSON-LD URLs.
2. Move the existing English index markup into `ModelIndexContent({ locale })` without changing English string values or layout classes.
3. Use the Chinese summary catalog and Chinese page dictionary when `locale="zh"`.
4. Keep model names, developer names, MoE/Dense, attention labels, and parameter counts protected.
5. Make the English route render `locale="en"` and add the Chinese wrapper with localized metadata.
6. Run focused tests and `git diff` the English rendering code to verify preservation.

## Task 3: Extract locale-aware model detail rendering

**Files:**

- Create: `packages/app/src/components/model/ModelDetailContent.tsx`
- Modify: `packages/app/src/app/model/[slug]/page.tsx`
- Create: `packages/app/src/app/zh/model/[slug]/page.tsx`
- Test: `packages/app/src/components/model/model-page-copy.test.ts`

1. Add RED assertions for locale-correct aliases, breadcrumbs, release text, dashboard heading/description/link, article notice, and `lang="en"`.
2. Move the existing detail markup into a shared async server component while preserving the English output exactly.
3. Compile the same canonical MDX for both locales. On Chinese pages, add the approved Chinese notice and English-page link before an article wrapper marked `lang="en"`.
4. Send Chinese dashboard links to `/zh/inference` while preserving the exact existing query parameters.
5. Redirect Chinese aliases within `/zh/model`; keep unknown slugs on the locale-appropriate 404 path.
6. Keep architecture-diagram and embedded-dashboard internals out of this branch; they derive locale from the pathname after PR #836 and receive combined-order browser verification.
7. Run focused tests and compare English output contracts.

## Task 4: Add bidirectional metadata and discovery

**Files:**

- Modify: `packages/app/src/app/model/page.tsx`
- Modify: `packages/app/src/app/model/[slug]/page.tsx`
- Modify: `packages/app/src/app/zh/model/page.tsx`
- Modify: `packages/app/src/app/zh/model/[slug]/page.tsx`
- Modify: `packages/app/src/lib/i18n.ts`
- Modify: `packages/app/src/lib/i18n.test.ts`
- Modify: `packages/app/src/app/sitemap.ts`
- Test: add or extend a focused model metadata test under `packages/app/src/app/`

1. Add RED tests for `/model` mirrored-route matching, locale switching, index/detail canonicals, complete language alternates, Chinese OG locale, JSON-LD language/URLs, and localized sitemap pairs.
2. Switch English metadata to `enAlternates(...)` without changing English title/description text.
3. Add `zhAlternates(...)`, `ZH_OG_LOCALE`, and Chinese metadata/JSON-LD strings.
4. Register `/model` in `ZH_MIRRORED_ROUTES`.
5. Replace English-only sitemap model entries with `localizedPair(...)` for the index and every published slug.
6. Reuse English OG artwork rather than introducing CJK text into a renderer without verified CJK fonts.
7. Run focused metadata, i18n, sitemap, and catalog tests.

## Task 5: Cover real browser journeys and responsive layout

**Files:**

- Modify: `packages/app/cypress/e2e/model-architecture.cy.ts`
- Modify only if an observed full run requires it: `packages/app/timings.json`

1. Add stable, non-prose test IDs only where existing selectors cannot express the contract.
2. Extend the existing model spec with English and Chinese index-to-detail click journeys.
3. Assert Chinese chrome, card summaries, route-preserving hrefs, article notice, `lang="en"`, dashboard link, canonical/hreflang, architecture container, and embedded dashboard container.
4. Explicitly test 1440x900, 375px, and 390px widths and require no document-level horizontal overflow.
5. Run the affected spec in Chrome and Firefox against fixture-backed data.
6. If the modified spec materially changes shard balance, run the documented full `SPLIT=1` integration command and commit only observed timing output.

## Task 6: Review Chinese copy and English preservation

**Files:** all changed user-visible copy and tests.

1. Run the repository `review-zh-copy` workflow over every new Chinese string with its English source and full UI context.
2. Check all 12 translated summaries for factual scope, names, dates, model identifiers, and natural ML-infrastructure Chinese.
3. Read the rendered Chinese index and at least representative dense/MoE detail pages without referring to English.
4. Confirm the notice does not imply that the long-form article has been translated.
5. Compare `packages/app/content/models/` byte-for-byte against the branch base.
6. Confirm existing English page strings, links, query parameters, and metadata wording are unchanged except hreflang plumbing.

## Task 7: Full verification, review, and Draft PR

1. Run focused Vitest suites, then `bun run test:unit`, `bun run typecheck`, `bun run lint`, `bun run fmt`, typography checks, and `git diff --check`.
2. Run an `E2E_FIXTURES=1` production build. Record environmental blockers separately from source failures.
3. Run affected Cypress integration tests in Chrome and Firefox and any affected component specs.
4. Request independent source/spec and Chinese-copy reviews; fix verified findings with new RED/GREEN evidence.
5. Rebase on the latest `master` after earlier roadmap dependencies merge, especially #836, then repeat affected verification.
6. Commit with English conventional subjects and Chinese body translations.
7. Push `feat/zh-model-pages` and open a Draft PR titled `[11/N] fix(zh): localize model page chrome and metadata / 本地化模型页面界面与元数据`.
8. Use a bilingual PR body, link issue #823, state the dependency on #836, and explicitly state that long-form model articles remain English and deferred.
9. Add the bare PR URL to both language sections of issue #823 as an unchecked roadmap item. Do not mark it complete.
