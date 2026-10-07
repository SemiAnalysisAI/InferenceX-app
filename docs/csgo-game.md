# In-site Dust II development game

The CS:GO theme's English and Chinese landing launchers navigate to
`/games/csgo?lang=en` and `/games/csgo?lang=zh`. The URL remains on InferenceX.
A return link goes to the corresponding landing page. Desktop keyboard and
mouse are required; native pointer capture is available on the standalone page.

## Build and isolation

`tools/csgo-assets/build-site.mjs` bundles the game into
`packages/app/public/games/csgo`. Both the app's development and production build
scripts run it. Next rewrites `/games/csgo` to the generated static `index.html`.
This page does not mount the benchmark app, its providers or a game iframe.
The default dashboard does not import game modules, load game styles, or prefetch
the game. Returning leaves the game document; no engine is mounted in the
destination dashboard. Explicit GPU disposal and back/forward-cache behavior
remain part of the runtime-lifecycle acceptance work.

The game HTML and route headers specify `noindex, nofollow`. The game is absent
from the sitemap; landing-page metadata, canonical links, language alternatives
and benchmark content are unchanged. These are testable isolation properties,
not guarantees about search rankings or field Web Vitals.

## Reproducible assets

The build verifies 1,094 map/model/audio files against `assets-lock.json` and
`game-assets-lock.json`. A local verified asset directory can be reused.
Otherwise, it downloads archive parts from
[asset commit cbd31f5fe46582aa882726e299b8b41a218c343c](https://github.com/SemiAnalysisAI/InferenceX-app/tree/cbd31f5fe46582aa882726e299b8b41a218c343c).
Every part and the assembled archive have pinned byte counts and SHA-256 hashes.
Archive members must match the expected file list; traversal, links and special
files are rejected before extraction. Verified files are materialized into the
website's static output. Browsers request them only from the website's origin.

The requester explicitly approved public publication of the asset archive and,
after release-upload failures, the dedicated asset branch. The failed release
remains an empty draft, not the asset source. The asset branch is not merged into
the app branch. It still adds roughly 363 MiB to the repository's object storage.
This distribution decision is not an independent license review of community ports.

## Scope and acceptance

The game is an optional presentation experience, not a public benchmark-data
view. It changes no benchmark filter, metric, calculation or API response.
It uses the presentation-only exclusion in AGENTS.md; the same exclusion is
recorded in the read-only-view and skills documentation.

One human and nine bots are implemented, but high-skill bot qualification and
95% reference fidelity remain unproven. Keep PR #1282 draft and unmerged.
See [game controls and limitations](../tools/csgo-assets/GAME.md) and
[weapon fidelity](../tools/csgo-assets/WEAPON-FIDELITY.md).
