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

- All 47 game-tool Node tests pass with no skips, including archive rejection,
  corrupt/oversized response checks, RGBExp decoding, lighting-data hashes and
  finite geometry/UV coverage and cancellation of pending mouse capture.
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
- Final same-origin navigation tests pass at English 1280 px and Chinese
  390 px. Both select the theme from the real landing page, verify no game
  prefetch on hover/focus, navigate in the same tab, load map and lighting
  assets from the same origin, check noindex headers and return to the
  corresponding landing page with no game engine on that document.
  English gameplay also verifies movement, firing, ten players and exactly
  one human. Both flows record zero page errors and no horizontal overflow.
  See [navigation observations](./site-navigation.json).

## Gameplay regression

The native-input regression passed all 60 physical spawn-to-site routes,
buying, strafing, firing, reloading and eight decoded/played audio samples.
The accelerated full match ended in round 25, CT 16–T 9, with 111 kills and
no page errors. The human slot was idle during the match portion.
See [raw match observations](./site-full-match.json).

This run followed the pending-capture cancellation fix. The first attempt
timed out clicking a buy-menu item; that failure is not counted as a pass.
The final four-face visual preservation change does not change collision or
simulation; its visual/data checks are separate from the full-match run.

The updated native-input combat fixture passes Nova pellet/trigger behavior,
AK automatic fire/recoil/recovery/reload, AWP two-stage scopes and movement,
death-scope reset, pause/resume and Chinese narrow-screen layout. Ten
knife/AWP switch cycles retain 307 geometries and 318 textures after warmup.
See [combat observations](./site-combat.json). The fixture uses test funding
and a staged target; it does not qualify competitive aim or bot skill.
The old fixture's absolute mouse reposition was removed because it changes
aim under native pointer capture; the replacement asserts the staged shot angle.

The standard game-input client completed two exploration passes on the separate
hosted-preview input adapter, using strafe, fire and jump inputs. The final state
has 18 pistol rounds after two shots and a changed player position; no console
or page-error report was emitted. See [final input state](./site-input-state.json)
and [capture](./site-input.png). This adapter is not the website launch destination.

An initial site-flow check caught an unhandled skipped cross-document
transition during the heavy game load. The CS:GO landing banner now opts out
of that transition while mounted. Normal themes retain their previous behavior.

## Lighting scope

The renderer uses the map port's original baked samples for 2,773 world surfaces
across 42 material groups. The 2048 × 512 RGBExp atlas and geometry are hash-locked.
The collision mesh is unchanged. See [LIGHTING.md](../LIGHTING.md).
Four additional world faces without baked samples are preserved with neutral
lighting instead of being dropped from replaced material groups.

Six staged views, two at each bombsite and two along the B route, render without
page errors. Visual inspection found no obvious missing walls in these sampled
views. See [camera positions and renderer counts](./site-lighting-views.json),
[A site](./site-a.png), [B site](./site-b.png) and [B route](./site-b-route.png).
The real-time FPS/debug label can lag a manually stepped capture; it is not used
as a performance measurement.

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
node tools/csgo-assets/lighting-browser-test.mjs \
  'http://127.0.0.1:3003/games/csgo?quality=low'
```

Set `CHROMIUM_PATH` if Playwright's installed Chromium is in a non-default
location. Run GPU-heavy fixtures serially. Software-rendered screenshots and
accelerated simulation are not presentation-hardware performance measurements
or competitive bot qualification.

## Hosted preview status

The Vercel preview build for application commit
`b09c6ce83eba87a3cbe7ef5318119a569d7df9fa` completed successfully. Its build log
confirms that it restored all 1,094 verified assets before building the app:
[deployment](https://vercel.com/semianalysisai/inferencemax-app/EurpJ4mdPXZewjvV4F19TEAhpfY8).
The existing Vercel preview protection redirects unauthenticated requests to
login. Local production-server checks are not represented as an authenticated
remote browser test. Protection was not disabled, and production was not changed.
