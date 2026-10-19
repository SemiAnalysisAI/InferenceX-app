# Blog Infrastructure

## Why MDX + Static Generation

Blog posts are MDX files in `packages/app/content/blog/`, compiled at build time via `next-mdx-remote`. This was chosen over a CMS or database because:

- **No runtime dependency**: Posts are part of the repo, versioned in git, reviewed in PRs. No CMS outage can break the blog.
- **MDX flexibility**: Authors can embed custom React components (`Figure`, `Blur`) alongside Markdown. This matters for image-heavy technical articles with captions, paywall teasers, and code blocks.
- **Static generation**: `generateStaticParams()` pre-renders all post pages. No server-side rendering at request time.

Syntax highlighting uses Shiki with dual light/dark themes (CSS class-based switching, not runtime theme detection).

## Content Format

```yaml
# Frontmatter (required: title, subtitle, date)
title: string
subtitle: string
date: YYYY-MM-DD
modifiedDate?: YYYY-MM-DD # Used in sitemap and JSON-LD
publishDate?: YYYY-MM-DD # Scheduled publishing, hidden in production until this date
seoDescription?: string # Meta and JSON-LD description; defaults to the subtitle cut to 155 chars
tags?: string[] # Used for filtering on /blog and in RSS categories
thumbnail?: string # Blog card image; defaults to the first <Figure>, then public/images/<slug>/
thumbnailLight?: string # Per-theme override of thumbnail
thumbnailDark?: string # Per-theme override of thumbnail
```

Slug is derived from the filename (e.g., `my-post.mdx` -> `my-post`), not from frontmatter. Reading time counts 265 words per minute plus 400 CJK characters per minute, rounded up, with a minimum of 1 minute.

Heading ID deduplication: if two headings share a slug, the second gets prefixed with its parent heading's slug (e.g., `overview-details`). If no parent exists, a level suffix is appended (`intro-2`).

`<Figure caption>` is a plain string prop, so MDX never parses it. Inline `[label](https://…)`
links in a caption are turned into real anchors by `renderCaption` in `mdx-components.tsx`;
other markdown (bold, code) still renders literally.

### Scheduled Publishing (`publishDate`)

Posts without `publishDate` are hidden in production — this field is required for a post to be visible. If `publishDate` is set to a future date, the post is hidden until that date arrives. In development, all posts are visible regardless. This allows articles to be merged to `master` via PR and go live automatically when the date arrives. All downstream consumers (sitemap, RSS, llms.txt) automatically respect the filter since they call `getAllPosts()`. `getPostBySlug()` still returns the post regardless of `publishDate` (for direct URL preview).

## Math (KaTeX)

`remark-math` + `rehype-katex` run in the MDX pipeline of both `/blog/[slug]` and
`/zh/blog/[slug]`. Write display math as a `$$`-fenced block:

```
$$
\mathbf{S}_t = \mathbf{S}_{t-1} + \beta_t\mathbf{v}_t\mathbf{k}_t^\top
$$
```

`singleDollarTextMath` is **disabled**: a lone `$` is never a math delimiter, because posts
are full of prices like `$1.95/GPU/hr` and `$3 per million tokens` that would otherwise be
swallowed into a formula. Inline math therefore also needs `$$…$$`.

KaTeX runs with `strict: false`, and one malformed expression renders in red rather than
failing the whole build. `katex/dist/katex.min.css` is imported by the post pages, and its
fonts are emitted to `/_next/static/media/` — no external CDN.
