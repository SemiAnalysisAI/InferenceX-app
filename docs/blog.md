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
tags?: string[] # Used for filtering on /blog and in RSS categories
```

### Scheduled Publishing (`publishDate`)

Posts without `publishDate` are hidden in production — this field is required for a post to be visible. If `publishDate` is set to a future date, the post is hidden until that date arrives. In development, all posts are visible regardless. This allows articles to be merged to `master` via PR and go live automatically when the date arrives. All downstream consumers (sitemap, RSS, llms.txt) automatically respect the filter since they call `getAllPosts()`. `getPostBySlug()` still returns the post regardless of `publishDate` (for direct URL preview).

Slug is derived from the filename (e.g., `my-post.mdx` -> `my-post`), not from frontmatter. Reading time is calculated at 265 WPM.

## MDX Components Available to Authors

| Component                                      | Usage                            | Notes                                                                             |
| ---------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `# / ## / ###`                                 | Headings with auto-generated IDs | IDs are deduped: second `## Details` under `## Results` becomes `results-details` |
| `[text](url)`                                  | Links                            | Internal links use `<Link>`, external get `target="_blank"`                       |
| `![alt](src)`                                  | Images                           | Rendered via `next/image` with lazy loading (first image is eager)                |
| `<Figure src="..." alt="..." caption="..." />` | Captioned figures                | Uses `<img>` (not `next/image`) for external URLs                                 |
| `<Blur>...</Blur>`                             | Paywall teaser blur overlay      | Content is blurred, unselectable, and not clickable                               |
| `<JsonLd>{...}</JsonLd>`                       | Structured data (JSON-LD)        | Renders `<script type="application/ld+json">`. Validates JSON before rendering.   |

Heading ID deduplication: if two headings share a slug, the second gets prefixed with its parent heading's slug (e.g., `overview-details`). If no parent exists, a level suffix is appended (`intro-2`).

## Blog Library (`src/lib/blog.ts`)

| Function                  | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `getAllPosts()`           | All posts sorted newest-first                             |
| `getPostBySlug(slug)`     | Single post meta + raw MDX content                        |
| `getAdjacentPosts(slug)`  | `{ prev, next }` — prev is older, next is newer           |
| `extractHeadings(rawMdx)` | h1-h3 headings with unique IDs (strips code blocks first) |
| `slugify(raw)`            | URL-safe slug generation                                  |
| `getReadingTime(content)` | Word count / 265, minimum 1 minute                        |

## SEO Features

### Dynamic OG Images (`/blog/[slug]/opengraph-image.tsx`)

1200x630px images generated at build time with `next/og` (Satori). Design: decorative tile sidebar + dark content panel with title, subtitle, date, and logo. Title font size scales (56-72px) based on length for readability at thumbnail sizes.

### RSS Feed (`/feed.xml`)

RSS 2.0 with Dublin Core and Atom extensions. Includes all posts with title, link, description, creator, pubDate, categories. Cached 1 hour.

### LLM Discovery (`/llms.txt`, `/llms-full.txt`)

- `/llms.txt`: Site description + article index with titles, URLs, and subtitles
- `/llms-full.txt`: Full raw MDX content of every post, for LLM context ingestion

### Sitemap Integration

Blog index at priority 0.8 (weekly), individual posts at priority 0.7 (monthly, uses `modifiedDate` if present).

### JSON-LD

- `/blog` page: `Blog` schema
- `/blog/[slug]` page: `BlogPosting` schema (headline, author, publisher, dates, wordCount, timeRequired)

## UI Components

### Table of Contents (`blog-toc.tsx`)

Two modes based on available viewport space:

- **Sidebar** (>= 240px right of content): Fixed position, follows scroll via imperative DOM updates in a scroll handler. Active heading tracked via `IntersectionObserver` with `rootMargin: '0px 0px -80% 0px'`. Falls back to last heading when scrolled to page bottom.
- **Inline** (narrow screens): Collapsible `<details>` card.

The sidebar position is calculated relative to the `[data-blog-section]` element and updated on scroll/resize.

### Reading Progress Bar (`reading-progress-bar.tsx`)

Fixed-top 0.5px bar tracking scroll position within the `<article>` element. Fires milestone events at 25/50/75/100% thresholds (each fires only once per page load).

### Heading Links (`heading-link.tsx`)

Copy-to-clipboard button shown on heading hover. State cycle: idle -> copied ("Link copied" text) -> fade out -> idle.

### Post Navigation (`blog-post-nav.tsx`)

Previous (older) / Next (newer) post links with title display. Uses `getAdjacentPosts()`.

## Analytics Events

All blog analytics use the `blog_` prefix per the `[section]_[action]` convention:

| Event                                            | Trigger                      |
| ------------------------------------------------ | ---------------------------- |
| `blog_post_clicked`                              | Click post card on list page |
| `blog_toc_clicked`                               | Click TOC heading            |
| `blog_read_milestone`                            | Scroll past 25/50/75/100%    |
| `blog_heading_link_copied`                       | Copy heading link            |
| `blog_nav_prev` / `blog_nav_next`                | Click prev/next post         |
| `blog_back_clicked`                              | Click back to articles       |
| `blog_tag_filtered`                              | Click tag filter             |
| `social_share_twitter` / `social_share_linkedin` | Click share buttons          |

## Adding a New Blog Post

1. Create `packages/app/content/blog/<slug>.mdx` with required frontmatter (`title`, `subtitle`, `date`)
2. Add optional `tags`, `modifiedDate`, and `publishDate` frontmatter
3. Write content using standard Markdown + available MDX components
4. The post automatically appears in: blog list, sitemap, RSS feed, llms.txt, OG image generation
5. No code changes needed — just the MDX file

## Auto-Generated SEO Articles

A weekly GitHub Action (`.github/workflows/seo-articles.yml`) generates per-model benchmark articles from InferenceX data:

1. **Data script** (`packages/app/scripts/generate-seo-articles.ts`) fetches benchmark data from the production API and writes a JSON summary to `packages/app/tmp/seo-data.json`
2. **Claude Code Action** reads the data + article template (`packages/app/scripts/seo/article-template.md`) and writes MDX files to `content/blog/`
3. A PR is created for human review before merge

### Running locally

```bash
pnpm admin:seo:data                                    # fetch data from production
pnpm admin:seo:data --base-url http://localhost:3000    # fetch from local dev
```

### Article template

The template at `packages/app/scripts/seo/article-template.md` defines the section order and formatting rules. Claude adapts depth and tone to each model's data richness — sparse-data models get shorter, honest articles; data-rich models get detailed analysis with framework and disagg comparisons.

### Slugs

Per-model articles use `best-gpu-for-<modelKey>-inference` slugs (e.g., `best-gpu-for-dsr1-inference`). The rollup uses `inference-benchmark-roundup`. Slugs are stable across updates to preserve SEO authority.
