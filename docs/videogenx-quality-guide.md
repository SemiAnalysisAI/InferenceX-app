# VideoGenX Quality Guide

`/vgx/quality` and `/zh/vgx/quality` explain how VideoGenX will score lossy speedups. They render
`packages/app/content/videogenx/quality.mdx` and `zh/quality.mdx` through the shared tutorial shell
described in [PowerX Tutorial](./powerx-tutorial.md): the article, MDX map, callout, widget frame
and chips live in `src/components/tutorial/`, and the loader in `src/lib/tutorial/tutorial-content.ts`
reads the `VIDEO_QUALITY_GUIDE` config (`src/lib/video/quality-guide.ts`), which also sets the
guide's eyebrow, back link and test ids. The InferenceX
`video-generation/README.md#reference-psnr` links here.

## Argument

The page answers one question: why the dashboard draws no PSNR cut-off against the Diffusers
reference. Its order follows that argument.

1. `reference-psnr` shows every lossless clip of one published run against an example 10–17 dB
   cut-off. Many clips fall inside the band with no lossy optimization. Each GPU spans most of the
   range on its own, and most prompts score about the same on both GPUs, so the spread follows the
   prompt, not the hardware or the engine.
2. `method` renders `MethodDiagram` from `QualityMethod.tsx`, the diagram the dashboard's "How we
   score quality" panel draws, so the two never disagree.
3. `tradeoff` shows how the future speedup-against-quality chart will read.
4. "Where the scores show up" names the shipped dashboard surfaces.

The prose states no measured number. Every measured value on the page is computed from published
results at render time.

## Measured data

`loadReferencePsnrEvidence()` (`src/lib/video/reference-psnr-evidence.ts`) reads the published
History and the run's published artifacts through the in-process `/api/video-runs` transport, the
same read the dashboard's first document uses. It keeps approved observations of the pinned run,
builds each side with `publishedResultsSide`, and extracts scores with `referencePsnrScores`
(`quality-method.ts`). `referencePsnrRange`, which the dashboard panel shows, derives from the same
function, so lossy leads, the matched-noise rerun and identical or unscored pairs are excluded in
both places.

The run is pinned (`REFERENCE_PSNR_RUN_ID`) because the argument needs one engine across GPUs.
Hardware labels come from the data. Any failed or incomplete read returns `hardware: null`, and the
widget shows a "published scores unavailable" box at the chart's height instead of failing the page.
The loader rethrows Next's dynamic-rendering signal (`unstable_rethrow`), so a prerender never
bakes in the unavailable state by accident. The pages export `revalidate = 3600` as a ceiling; the
video read cache (`VIDEO_CACHE_REVALIDATE_SECONDS`, five minutes) sets the actual window, so the
build lists them at 5m. The plotted run never changes, so a refresh only retries a failed read and
is otherwise a cache hit.

The browser receives the scores, not the published results: the two artifacts are about 1.6 MB
for 40 numbers. Under `E2E_FIXTURES=1` the run is absent from the fixture History, so local
fixture servers show the unavailable state.

## Illustrative data

The `tradeoff` widget draws placeholder configs badged "Illustrative, not measured". Their
speedups apply one vendor-reported ratio and their quality scores are invented. They carry no GPU
or engine name, because no paired run exists on any GPU. When paired runs exist, replace
`EXAMPLES` with scores read from a paired-quality attachment and lossless-twin latency ratios
(`losslessTwin` in `deployment.ts`), and remove the badge.

## Layout stability

Widgets never move the page. Both charts place x in percentages inside full-width SVGs, so the
server render already has its final geometry and no width measurement runs after hydration. Text
that changes with a control (the x-axis title, the readout name) stacks every variant in one grid
cell, so its box keeps the tallest variant's height. Readout values start at a fixed column. The
hover tooltip remounts per clip, so it is placed before its first paint.
`cypress/component/video-quality-guide.cy.tsx` fails on any layout shift outside the floating
tooltip.

## Analytics

Every control tracks a `video_quality_guide_*` event: `returned`, `run_opened`, `psnr_point`,
`scores_opened`, `tradeoff_metric` and `tradeoff_point`. Hover and focus change state without
tracking. The dashboard's "Full methodology" link keeps `video_results_quality_methodology_clicked`.

## Indexing

Both pages are `noindex, follow`, like `/vgx`. `tutorialMetadata` sets that for every guide, so
when the `video` route becomes indexable, give `TutorialGuide` a per-guide flag and add the pair
to the sitemap. `/video/quality` redirects
through the legacy dashboard prefix rule.
