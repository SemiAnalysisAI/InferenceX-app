# PowerX Tutorial

`/powerx/tutorial` and `/zh/powerx/tutorial` render `packages/app/content/powerx/tutorial.md` and
`zh/tutorial.md`. Those two files are the only source: GitHub renders them as they are, and the app
compiles the same file with `compileBlogMdx(raw, locale, { format: 'md', … })`. No second copy.

## Allowed syntax

- GitHub-flavoured markdown: headings, lists, tables, fenced code, links, images, emphasis.
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), rendered by
  `remark-github-alerts.ts` as `aside[data-callout]` → `TutorialCallout`.
- `<details><summary>`, `<kbd>`, `<br>`, rebuilt as elements by `remark-github-html.ts` because
  plain-markdown MDX drops raw HTML.
- Not allowed: `import`/`export`, `{}` expressions, other HTML or JSX, `$math$`. Front matter is
  exactly `title`, `description`, `updated` (`'YYYY-MM-DD'`).

Figures go in `packages/app/public/images/powerx-tutorial/` and are referenced in both files as
`../../public/images/powerx-tutorial/<name>.png`, which GitHub resolves; the page's `img` override
rewrites that prefix to `/images/powerx-tutorial/<name>.png`.

## Interactive widgets

An image under `packages/app/public/images/powerx-tutorial/widgets/<name>.png` is a widget mount:
`<name>` is a key of `POWERX_TUTORIAL_WIDGETS` (`src/components/powerx/widgets/index.ts`), and the
page's `img` override renders that `'use client'` component with `locale` and the image's alt text
instead of the PNG. `remark-widget-images.ts` lifts the image out of its paragraph so the widget is
a block. The PNG is the GitHub fallback and must be a screenshot of the finished widget, so the
existing image guard keeps every path real. Keep the SGLang rhythm around each mount: one short
paragraph that names the knobs, the image line, one nudge line; no prose inside the widget, meaning
in chip subtitles and hover titles, a ⚠️ note only when the state needs it.

To add one: write the pure model in `src/lib/powerx/<name>.ts` with a unit test (including the
hash codec: each widget keeps its selection in the URL hash under its own key via
`useWidgetHash`), build the component on `widget-chrome.tsx` (`WidgetCard`, `ChipRow`, `RangeRow`,
`OutputBadge`, `OutputHeader`, `WidgetNote`, `CopyButton`), register it in `widgets/index.ts`,
track every control as `powerx_tutorial_<name>_<action>`, add the three lines to both markdown
files, and screenshot the widget at 1100 px light theme into `widgets/<name>.png`. The tutorial
test fails when a referenced widget image has no registry key or a registry key has no image.

`packages/app/src/lib/powerx/tutorial.test.ts` keeps the pair in step and concise: same front-matter
keys, heading sequence, links (after `/zh/` mapping), images, alerts and `<details>` counts; no
syntax GitHub would not render; EN ≤ 1,600 words with no H2 over 450, ZH ≤ 3,000 CJK characters,
FAQ ≤ 10 questions. Both pages stay `noindex` until the PowerX tab is indexable; flip `robots` in
`tutorial.ts` and add the pair to the sitemap together.
