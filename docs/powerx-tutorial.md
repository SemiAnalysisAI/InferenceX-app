# PowerX Tutorial

`/powerx/tutorial` and `/zh/powerx/tutorial` render `packages/app/content/powerx/tutorial.mdx` and
`zh/tutorial.mdx` through `compileBlogMdx(raw, locale, createPowerXTutorialComponents(locale))`.
The pages are the only rendering target; the files are not written for GitHub.

## Syntax

- Markdown with GFM, as in the blog.
- `<Callout kind="note">` (or `tip`, `important`, `warning`, `caution`) renders `TutorialCallout`,
  a ruled aside, not a card. Leave blank lines around the body so it parses as paragraphs.
- `<Widget name="<key>" alt="…" />` mounts an interactive widget (below).
- The FAQ is the last H2 and consists only of `<details><summary>` items.
- Front matter is exactly `title`, `description`, `updated` (`'YYYY-MM-DD'`).

## Page shape

The page is one reading column (`max-w-5xl` container, 72ch prose) with wider section rhythm than
the blog. The body opens with the ladder widget before the first H2, so the hero (eyebrow, title,
dek from front matter) is followed by the first visual. Every H2 gets a running number from the
`h2` override in `tutorial-mdx-components.tsx`; there is no "On this page" list.

## One visual grammar

Every chart, diagram and readout uses the same three fills, declared by `GrammarLegend` and drawn by
`GrammarSwatch` (`widget-chrome.tsx`): **solid** = measured telemetry, **outlined** (hairline stroke,
14 % wash) = modeled by the power model, **dashed** = rated or assumed (TDP, all-in provisioned,
PUE). Hue carries the chip and comes from `useThemeColors().resolveColor(hwKey)`; the flow diagram
has no chip and uses `--brand`. Do not add a palette.

## Interactive widgets

`<Widget name>` takes a key of `POWERX_TUTORIAL_WIDGETS` (`src/components/powerx/widgets/index.ts`)
and renders that `'use client'` component with `locale` and `alt`, wrapped in `div[data-layout]` at
the registry's layout: `bleed` (container width: ladder, flow, measured-vs-modeled) or `column`
(72ch).

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

To add one: write the pure model in `src/lib/powerx/<name>.ts`, build the component
on `widget-chrome.tsx` (`WidgetFrame`, `Chips`, `CopyButton`, `GrammarLegend`, `useView`,
`useWidgetHash`), register it with a layout in `widgets/index.ts`, and add the `<Widget>` line to
both `.mdx` files.

Both pages stay `noindex` until the PowerX tab is indexable; flip
`robots` in `tutorial.ts` and add the pair to the sitemap together.
