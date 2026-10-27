# PowerX Tutorial

`/powerx/tutorial` and `/zh/powerx/tutorial` render `packages/app/content/powerx/tutorial.md` and
`zh/tutorial.md`. Those two files are the only prose: GitHub renders them as they are, and the app
compiles the same file with `compileBlogMdx(raw, locale, { format: 'md', … })`. No second copy.

## Allowed syntax

- GitHub-flavoured markdown: headings, lists, tables, fenced code, links, images, emphasis.
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), rendered by
  `remark-github-alerts.ts` as `aside[data-callout]` → `TutorialCallout` (a ruled aside, not a card).
- `<details><summary>`, `<kbd>`, `<br>`, rebuilt as elements by `remark-github-html.ts` because
  plain-markdown MDX drops raw HTML. The FAQ is the last H2 and consists only of `<details>` items.
- Not allowed: `import`/`export`, `{}` expressions, other HTML or JSX, `$math$`. Front matter is
  exactly `title`, `description`, `updated` (`'YYYY-MM-DD'`).

## Page shape

The page is one reading column (`max-w-5xl` container, 72ch prose) with wider section rhythm than
the blog. The body opens with the ladder widget before the first H2, so the hero (eyebrow, title,
dek from front matter) is followed by the first visual. Every H2 gets a running number from the
`h2` override in `tutorial-mdx-components.tsx`; there is no "On this page" list.

Figures go in `packages/app/public/images/powerx-tutorial/` and are referenced in both files as
`../../public/images/powerx-tutorial/<name>.png`, which GitHub resolves; the page's `img` override
rewrites that prefix to `/images/powerx-tutorial/<name>.png`.

## One visual grammar

Every chart, diagram and readout uses the same three fills, declared by `GrammarLegend` and drawn by
`GrammarSwatch` (`widget-chrome.tsx`): **solid** = measured telemetry, **outlined** (hairline stroke,
14 % wash) = modeled by the power model, **dashed** = rated or assumed (TDP, all-in provisioned,
PUE). Hue carries the chip and comes from `useThemeColors().resolveColor(hwKey)`; the flow diagram
has no chip and uses `--brand`. Do not add a palette.

## Interactive widgets

An image under `packages/app/public/images/powerx-tutorial/widgets/<name>.png` (or `.svg`) is a
widget mount: `<name>` is a key of `POWERX_TUTORIAL_WIDGETS` (`src/components/powerx/widgets/index.ts`),
and the page's `img` override renders that `'use client'` component with `locale` and the image's
alt text instead of the file, wrapped in `div[data-layout]` at the registry's layout: `bleed`
(container width: ladder, flow, measured-vs-modeled) or `column` (72ch). `remark-widget-images.ts`
lifts the image out of its paragraph so the widget is a block. The file is the GitHub fallback: a
screenshot of the finished widget at 1100 px light theme, or for `flow` the SVG exported from the
same `FlowSvg` component (`bun run powerx:flow-svg`, guarded by `tutorial.test.ts`).

Widgets:

- `ladder` (hero): three chips (B200, GB200 NVL72, MI355X) → `PowerLadder` on the validated
  DeepSeek-V4-Pro AgentX point nearest 50 tok/s/user from `/api/v1/views/inference`, or a labelled
  example input at 60 % of TDP when the chip has none. The chip is page state (`hardware-store.ts`,
  hash `hw`) that `load` and `worked-example` follow.
- `flow`: `FlowSvg`, hover or focus a node for its sentence; vertical under 640 px.
- `measured-vs-modeled`: `y_measuredJPerOutputToken` and `y_utilityModeledJPerOutputToken` for the
  same points, one emphasis toggle (hash `mm`), crosshair tooltip with the ratio.
- `load`: one slider (hash `ld`) from 0 W to TDP through `loadSweep`; a small-multiples strip shows
  which modeled parts follow the GPU and which stay flat.
- `validity`: the five validator checks as `<details>` rows with reason code, audit fields, source.
- `run-config`: platform and topology visible, workload and strictness under "More options"
  (hash `rc`); one YAML block with Copy, citations in a muted line (`run-config.ts` returns them
  separately).
- `worked-example`: the hero's point as a compact ladder plus a six-value readout and three links.

Numbers come only from the power model port (`computeBasis` → `buildLadder`), `HW_REGISTRY`, or the
views API. Nothing measured is embedded in source. Every control tracks
`powerx_tutorial_<widget>_<action>`.

To add one: write the pure model in `src/lib/powerx/<name>.ts` with a unit test, build the component
on `widget-chrome.tsx` (`WidgetFrame`, `Chips`, `CopyButton`, `GrammarLegend`, `useView`,
`useWidgetHash`), register it with a layout in `widgets/index.ts`, add the image line to both markdown
files, and screenshot it into `widgets/<name>.png`. The tutorial test fails when a referenced widget
image has no registry key, a registry key has no fallback file, or a widget renders inside `<p>`.

`packages/app/src/lib/powerx/tutorial.test.ts` keeps the pair in step and concise: same front-matter
keys, heading sequence, links (after `/zh/` mapping), images, alerts and `<details>` counts; no
syntax GitHub would not render; EN ≤ 1,100 words with no H2 over 300, ZH ≤ 2,000 CJK characters,
FAQ ≤ 10 items, lead ≤ 80 words. Both pages stay `noindex` until the PowerX tab is indexable; flip
`robots` in `tutorial.ts` and add the pair to the sitemap together.
