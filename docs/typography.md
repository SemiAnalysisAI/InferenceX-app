# Typography

How text is sized and spaced in the app, and the ratchet gate that keeps it that way.

## Tokens

Defined in the `@theme` block of `packages/app/src/app/globals.css`:

| Token                 | Class               | Value                             | Use for                                           |
| --------------------- | ------------------- | --------------------------------- | ------------------------------------------------- |
| `--text-2xs`          | `text-2xs`          | 0.6875rem (11px)                  | Micro labels one step below `text-xs`             |
| `--text-3xs`          | `text-3xs`          | 0.625rem (10px)                   | Densest labels: table meta, tooltips, log gutters |
| `--text-dialog-title` | `text-dialog-title` | 1.375rem (22px), 30px line height | Centered announcement dialog headings             |
| `--text-title`        | `text-title`        | 1.75rem (28px), 36px line height  | Desktop size of the dashboard page title          |
| `--container-measure` | `max-w-measure`     | 36rem (576px)                     | Body text measure on reading pages                |
| `--leading-reading`   | `leading-reading`   | 1.65 (1.8 under `:lang(zh)`)      | Body text line height on reading pages            |
| `--tracking-eyebrow`  | `tracking-eyebrow`  | 0.16em                            | Easter-egg theme decorations only (no app UI)     |
| `--tracking-heading`  | `tracking-heading`  | -0.04em                           | Display headings at `text-4xl` and larger only    |

Rules of thumb:

- Body and heading sizes use the standard Tailwind scale (`text-xs` … `text-6xl`). Do **not** add wrapper components for body text.
- Never write `text-[11px]`, `text-[0.65rem]`, `tracking-[0.16em]`, etc. — the gate (below) blocks new arbitrary font sizes and letter-spacing values. `tracking-[0.1em]` is exactly `tracking-widest`; use the built-in.
- The micro size tokens deliberately define **no paired line-height**: the arbitrary values they replaced set only `font-size` and inherited line-height, and dense tables depend on that. Don't add `--text-2xs--line-height` without re-checking those surfaces.
- The custom tracking tokens are registered with tailwind-merge in `src/lib/shared/utils.ts` (`extendTailwindMerge`); if you add a token, add it there too or `cn()` will keep conflicting classes.
- Labels, kickers and legends are sentence case: `text-xs font-medium text-muted-foreground`, normal tracking. No `uppercase` + wide tracking recipes, and mono only for code, IDs, hashes, commands and numeric meta.
- Headings use weight 500 or 600 at most. Hierarchy comes from size and color.

## Components

- `<Heading>` (`src/components/ui/heading.tsx`) — cva-based visual heading levels (`display`, `page`, `title`, `section`, `card`, `label`) with the rendered tag chosen via `as`, so outline and visual size stay independent. `display`, `page` and `title` are `font-semibold`, `section` and `card` are `font-medium`. `title` (20px, 24px from `md`, 28px from `lg`) is the one visible page title of a dashboard tab, set by `DashboardSectionHeader` in the tab's header card. Chart card titles stay at `card`, and the `TabIntro` explainer below the results is supporting text at `card` with `text-sm` body, even though it keeps the SEO `<h1>`. Negative `tracking-heading` applies only where the size reaches `text-4xl`.
- `<Eyebrow>` (`src/components/ui/eyebrow.tsx`) — a small sentence-case label above a heading (`text-xs font-medium text-muted-foreground`). It does not uppercase, so pass sentence-case text. Delete eyebrows that only restate the heading.
- `<Card>` (`src/components/ui/card.tsx`) — a solid surface: `bg-card`, `border-border/30` hairline, `rounded-xl`, no blur or translucency. Do not nest a bordered panel directly inside a Card just to group. Use spacing and a label instead. Charts sit on the page or on the Card they belong to, never in a Card that only adds a border.
- `<Stat>` (`src/components/ui/stat.tsx`): a labelled figure (`dt` label, `dd` value, optional `detail` line) for stat rows. Wrap rows in a `<dl>`. `size` picks the value size (`sm` base, `md` lg, `lg` 2xl) and `boxed` puts each stat on its own card tile. `valueFirst` puts the figure above a `text-sm` label for facts like "11 / per-point telemetry charts". Values are `font-medium tabular-nums whitespace-nowrap`. Use it instead of a local `StatCard`.
- `<EmptyState>` (`src/components/ui/empty-state.tsx`): the message for a section, table or chart with nothing to show, and for loading or missing notices in its place. Optional `title` and `action`. `bare` drops the card surface when it already sits inside a card or chart.
- `<VendorDot>` (`src/components/ui/vendor-dot.tsx`): the vendor-colored dot that identifies a chip. NVIDIA and AMD get their brand colors, other vendors a neutral dot.

Radii follow one ladder, so corners nest: page and section surfaces (Card, dialogs, the mobile menu) are `rounded-xl`, panels inside them (`ControlPanel`, legends, notices) are `rounded-lg`, controls (buttons, selects, inputs, segmented containers, badges) are `rounded-md`, and items inside a control or menu (segments via `SEGMENT_RADIUS_STYLE`, popover menu rows, select chips) are `rounded-sm`. Siblings of one kind share a radius, and a child is never rounder than its parent.

Blog/article typography is owned by `@tailwindcss/typography` (`prose`) via `BLOG_PROSE_CLASS`, and is out of scope for MDX content migration. Reading pages (blog, whitepapers, about, glossary, quotes, land acknowledgement, AgentX articles, hardware) share one layout. Wrap the page in `READING_PAGE_CLASS` (72rem frame) or `ARTICLE_PAGE_CLASS` (56rem frame, single-column articles) from `src/components/ui/reading-layout.ts`. Cap body text at `max-w-measure` with `leading-reading` at 16px (about 70 Latin or 36 CJK characters per line). Figures, tables and code blocks take the full column. `px-5` keeps 20px side margins on phones.

### Form controls and panels

Use the shared `Button`, `Input`, `SelectTrigger`, `MultiSelect`, and `SearchableSelect` instead of copying their class strings into page components. `control-styles.ts` owns the common geometry, select surface and focus treatment:

- Regular controls: 44px below `md`, 36px from `md` upward. Compact (`size="sm"`) buttons/selects stay 44px on phones and become 32px on desktop.
- Control labels and selected values: `text-sm`. Editable inputs/search fields: `text-base md:text-sm` to keep phone input text readable. Helper text and dense table metadata may stay `text-xs`; do not enlarge chart ticks, code, or data rows mechanically.
- `Label` uses a 20px line height so wrapped labels do not collide. `ControlPanel` supplies a semantic fieldset/legend with no border, background or padding. The legend is a sentence-case `text-xs font-medium text-muted-foreground` label with 8px below it, so panels can sit inside a Card without stacking boxes. Pass layout classes (columns, spans, width) rather than restating its spacing and colors.
- Segmented controls use the 44px phone hit areas with the original rounded border and inset segment spacing. Use `role="group"` for value filters (`aria-pressed`) and the existing tab semantics for chart/table switches. Use the shared `MultiSelect` combobox for any group that permits multiple selected values and has a long or data-driven option list (for example kernel modes or throughput series). Small fixed groups that are meant to be fast (Quick Filters: two to three options each) render every option as a visible `aria-pressed` toggle instead, so one tap selects without opening a dropdown. Preserve each group’s empty/all or minimum-selection rule; reserve segmented buttons for a single selected value. Chart legends and independent settings are separate controls, not multi-choice filter groups.
- Avoid local `h-7`, `h-8`, `text-xs` and dark-fill overrides on regular form controls. Compact chart toolbars may use the explicit small variant. Multi-select triggers use **minimum** heights so selected chips can wrap without losing data.

Focus decoration is intentionally neutral by product request: no focus-only rings, outlines, border/fill changes, or opacity accents. Keep hover, selected/checked, validation, and ordinary component borders/shadows independent. Do not suppress `box-shadow` globally: that would erase meaningful non-focus states. Keyboard focus and activation still work, but this policy removes the visible focus-location cue and does not meet the visible-focus accessibility requirement.

Rendered CSS regression tests live in `cypress/component/component-css.cy.tsx`; they check actual geometry, light/dark fills, label association, searchable keyboard selection, and filter actions inside forms.

### Informational help

Use `InfoHelp` for every standalone `(i)` explanation. `LabelWithTooltip`, `SelectedOptionInfo`, and `OptionInfo` reuse it for control labels, closed fields, and dropdown options. Hover and click must keep the same panel: mouse hover does not move focus, crossing into the explanation keeps it open, and click/tap/keyboard activation pins it until outside interaction or Escape. Keep help independent of the control's selection action.

All help surfaces share `HELP_CONTENT_CLASS_NAME`: `text-sm`, relaxed line height, 12px padding, the popover background, border, rounded corners, and shadow. Short hints on links/buttons retain tooltip semantics so clicking still performs the primary action, but use the same visual surface. Do not introduce local font, padding, or color overrides. Chart data readouts retain their separate chart-specific layouts and export behavior.

## Chart text

Chart font sizes live in TypeScript, not CSS variables: `CHART_TYPE` in `src/lib/d3-chart/typography.ts`, with the `px()` helper for `.attr('font-size', …)`. The PNG export path (`src/lib/export/chart-image-export.ts`, loaded by `useChartExport` on click) serializes the chart with html-to-image, which cannot resolve `var(--*)`; its `resolveCssVarsForExport()` only bakes color-type attributes, so a CSS-variable font-size silently collapses in exports. The shared export font stacks (`CHART_FONT_SANS`, `CHART_FONT_MINECRAFT`) live in the same module.

OG-image renderers (Satori: `opengraph-image.tsx`, `og-image-render.tsx`, `compare-og.tsx`) draw on a fixed canvas and intentionally hardcode display sizes — they are exempt from all of this.

## The ratchet gate

`bun run check:typography` (wired into CI's lint workflow and lefthook pre-commit) scans `packages/app/src` for:

1. `arbitrary-text-size` — `text-[<number>…]` in any `.ts`/`.tsx` (hex colors like `text-[#ed1c24]` are out of scope);
2. `arbitrary-tracking` — any `tracking-[…]`;
3. `chart-font-literal` — quoted `font-size` literals inside `src/lib/d3-chart/`.

Per-file counts are compared against `packages/app/scripts/typography-allowlist.json`:

- **A count above the allowlist (or a hit in an unlisted file) fails immediately** — fix it with a token, `CHART_TYPE`, or the standard scale.
- **A count below the allowlist also fails**, telling you to run `bun run check:typography --update` — so the allowlist only ever shrinks. It doubles as the migration burndown; there is no deadline, offenders migrate when their file is next touched.
- Matching logic lives in `src/lib/testing/typography-gate.ts` (unit-tested); exemptions (OG renderers, tests, the gate itself) are defined there.
