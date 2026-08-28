# Typography

How text is sized and spaced in the app, and the ratchet gate that keeps it that way.

## Tokens

Defined in the `@theme` block of `packages/app/src/app/globals.css`:

| Token                     | Class                   | Value            | Use for                                           |
| ------------------------- | ----------------------- | ---------------- | ------------------------------------------------- |
| `--text-2xs`              | `text-2xs`              | 0.6875rem (11px) | Micro labels one step below `text-xs`             |
| `--text-3xs`              | `text-3xs`              | 0.625rem (10px)  | Densest labels: table meta, tooltips, log gutters |
| `--tracking-eyebrow`      | `tracking-eyebrow`      | 0.16em           | Uppercase eyebrow/kicker labels                   |
| `--tracking-eyebrow-wide` | `tracking-eyebrow-wide` | 0.2em            | Extra-wide uppercase labels                       |
| `--tracking-heading`      | `tracking-heading`      | -0.04em          | Tightened display/hero headings                   |

Rules of thumb:

- Body and heading sizes use the standard Tailwind scale (`text-xs` … `text-6xl`). Do **not** add wrapper components for body text.
- Never write `text-[11px]`, `text-[0.65rem]`, `tracking-[0.16em]`, etc. — the gate (below) blocks new arbitrary font sizes and letter-spacing values. `tracking-[0.1em]` is exactly `tracking-widest`; use the built-in.
- The micro size tokens deliberately define **no paired line-height**: the arbitrary values they replaced set only `font-size` and inherited line-height, and dense tables depend on that. Don't add `--text-2xs--line-height` without re-checking those surfaces.
- The custom tracking tokens are registered with tailwind-merge in `src/lib/utils.ts` (`extendTailwindMerge`); if you add a token, add it there too or `cn()` will keep conflicting classes.

## Components

- `<Heading>` (`src/components/ui/heading.tsx`) — cva-based visual heading levels (`display`, `page`, `section`, `card`, `label`) with the rendered tag chosen via `as`, so outline and visual size stay independent. New pages should use it instead of retyping size/weight/tracking recipes; existing headings migrate file-by-file as pages get touched — no sweep.
- `<Eyebrow>` (`src/components/ui/eyebrow.tsx`) — the uppercase mono kicker label (`tone="brand" | "muted"`, `wide` for 0.2em tracking).

Blog/article typography is owned by `@tailwindcss/typography` (`prose`) and is out of scope — don't migrate MDX content styles to these tokens.

## Chart text

Chart font sizes live in TypeScript, not CSS variables: `CHART_TYPE` in `src/lib/d3-chart/typography.ts`, with the `px()` helper for `.attr('font-size', …)`. The PNG export path (`useChartExport`) serializes the chart with html-to-image, which cannot resolve `var(--*)`; its `resolveCssVarsForExport()` only bakes color-type attributes, so a CSS-variable font-size silently collapses in exports. The shared export font stacks (`CHART_FONT_SANS`, `CHART_FONT_MINECRAFT`) live in the same module.

OG-image renderers (Satori: `opengraph-image.tsx`, `og-image-render.tsx`, `compare-og.tsx`) draw on a fixed canvas and intentionally hardcode display sizes — they are exempt from all of this.

## The ratchet gate

`bun run check:typography` (wired into CI's lint workflow and lefthook pre-commit) scans `packages/app/src` for:

1. `arbitrary-text-size` — `text-[<number>…]` in any `.ts`/`.tsx` (hex colors like `text-[#ed1c24]` are out of scope);
2. `arbitrary-tracking` — any `tracking-[…]`;
3. `chart-font-literal` — quoted `font-size` literals inside `src/lib/d3-chart/`.

Per-file counts are compared against `packages/app/scripts/typography-allowlist.json`:

- **A count above the allowlist (or a hit in an unlisted file) fails immediately** — fix it with a token, `CHART_TYPE`, or the standard scale.
- **A count below the allowlist also fails**, telling you to run `bun run check:typography --update` — so the allowlist only ever shrinks. It doubles as the migration burndown; there is no deadline, offenders migrate when their file is next touched.
- Matching logic lives in `src/lib/typography-gate.ts` (unit-tested); exemptions (OG renderers, tests, the gate itself) are defined there.
