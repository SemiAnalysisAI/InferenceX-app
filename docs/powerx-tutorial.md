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

`packages/app/src/lib/powerx/tutorial.test.ts` keeps the pair in step and concise: same front-matter
keys, heading sequence, links (after `/zh/` mapping), images, alerts and `<details>` counts; no
syntax GitHub would not render; EN ≤ 1,600 words with no H2 over 450, ZH ≤ 3,000 CJK characters,
FAQ ≤ 10 questions. Both pages stay `noindex` until the PowerX tab is indexable; flip `robots` in
`tutorial.ts` and add the pair to the sitemap together.
