# In-site game and baked-lighting verification

Run date: October 6–7, 2026. This is implementation evidence, not approval of
95% CS:GO fidelity. The PR remains draft and unmerged.

## Website and asset delivery

The CS:GO landing theme now navigates in the same tab to
`/games/csgo?lang=en|zh`. Next serves the generated standalone game there,
including native mouse capture and a localized return link. The game has its
own `noindex, nofollow` HTML metadata and HTTP header.

The approved asset distribution is
[commit cbd31f5fe46582aa882726e299b8b41a218c343c](https://github.com/SemiAnalysisAI/InferenceX-app/tree/cbd31f5fe46582aa882726e299b8b41a218c343c).
A clean restore downloaded all 46 archive parts and verified their individual
hashes, the 380,768,262-byte assembled archive and all 1,094 extracted files.
Archive SHA-256:
`f3c57e50a71577d066434f71dcabf9fa5360139120f54baf6d1cf1abfbdcfa07`.
The release upload route failed; the unused release is an empty draft.

Browser requests use the website origin, not the asset branch or Perplexity.
The static game output is roughly 500 MiB; build-time download/storage costs are
real, even though normal dashboard visitors do not download it.

## Automated checks

- All 45 game-tool Node tests pass with no skips, including archive rejection,
  corrupt/oversized response checks, RGBExp decoding, lighting-data hashes and
  finite geometry/UV coverage.
- The production Next fixture build and TypeScript pass, generating 1,485 pages.
- The full workspace unit suites pass. The app suite has 6,210 passing tests in
  396 files and four skips. Focused launcher assertions cover the same-origin
  destination, no prefetch/iframe, localization, theme removal and game-only
  transition behavior.
- `theme-audit.mjs` repeats six cold English/Chinese landing configurations,
  four saved optional themes in embeds, both localized launcher checks, four
  theme enter/exit cycles and Googlebot HTML checks. Tested inactive states
  request no optional assets/code/fonts. SEO fields remain unchanged.
- Cypress cases were updated, but the Cypress runner was not run locally.

## Lighting scope

The renderer uses the map port's original baked samples for 2,773 world surfaces
across 42 material groups. The 2048 × 512 RGBExp atlas and geometry are hash-locked.
The collision mesh is unchanged. See [LIGHTING.md](../LIGHTING.md).

Displacements, props, brush entities, character lighting, original sky and
renderer exposure/tone mapping remain unqualified. A rendered scene and passing
data tests do not establish original CS:GO visual equivalence.

## Reproduction

From the repository root, with Node 24 and Bun 1.4.0:

```sh
bun install --frozen-lockfile
node --test tools/csgo-assets/*.test.mjs
E2E_FIXTURES=1 NEXT_DIST_DIR=.next-site bun run build
E2E_FIXTURES=1 NEXT_DIST_DIR=.next-site bun --cwd packages/app start --port 3003
node tools/csgo-assets/site-browser-test.mjs http://127.0.0.1:3003
FULL_MATCH=1 node tools/csgo-assets/browser-smoke.mjs \
  'http://127.0.0.1:3003/games/csgo?quality=low'
node tools/csgo-assets/combat-browser-test.mjs \
  'http://127.0.0.1:3003/games/csgo?quality=low'
```

Set `CHROMIUM_PATH` if Playwright's installed Chromium is in a non-default
location. Run GPU-heavy fixtures serially. Software-rendered screenshots and
accelerated simulation are not presentation-hardware performance measurements
or competitive bot qualification.
