---
allowed-tools: Read, Edit, Grep, Glob, Bash(pnpm typecheck), Bash(pnpm lint*), Bash(pnpm fmt*), Bash(pnpm --filter *app test:unit*), Bash(rg *), Bash(git log*), AskUserQuestion
description: Feature a new day-0 model across InferenceX (banner, modal, Quick Comparisons preset, default model)
---

Give a new "day-0" model the headline treatment across InferenceX: the landing **launch banner**,
the landing **launch modal**, the **Quick Comparisons** launch preset, and (optionally) the
**default model** the dashboard opens on. The previous day-0 model is retired cleanly so old share
links keep working and previously-dismissed users see the new banner.

Target model: **$ARGUMENTS** (e.g. "MiniMax M3"). If empty, ask the user which model to feature.

This command swaps the _promotion_ surfaces only. It does **not** add a new model to the dashboard —
the model must already exist (`Model.*`, label, prefix, DB mapping). If it doesn't, stop and point
the user to [docs/adding-entities.md](../../docs/adding-entities.md) first.

---

## Step 1 — Resolve the target model

1. Read `packages/app/src/lib/data-mappings.ts`. Confirm the target has:
   - a `Model.*` enum value (e.g. `Model.MiniMax_M3` = `'MiniMax-M3'`), and
   - a `MODEL_CONFIG` entry with a `label` and `prefix`.
     If it's missing, **stop** — tell the user to add the model mapping first (see the
     `feat: add <model> model mapping` PR pattern, e.g. PR #447 for MiniMax M3), then re-run.
2. Derive the identifiers used everywhere below from the model. Use a lowercase, hyphenated slug of
   the model name (drop the vendor only if redundant — match existing precedent like `dsv4` →
   here we use the full `minimax-m3`):
   - `SLUG` — kebab-case, e.g. `minimax-m3` (used in ids, storage keys, `?preset=` links)
   - `SLUG_` — underscored, e.g. `minimax_m3` (used in analytics event names)
   - `ENUM` — the `Model.*` member, e.g. `Model.MiniMax_M3`
   - `DISPLAY` — short human name, e.g. `MiniMax M3`
   - `G_MODEL` — the enum's string value, e.g. `MiniMax-M3`

## Step 2 — Ask the two launch questions

Use AskUserQuestion:

1. **Default model?** "Should the dashboard open on `DISPLAY` by default (change `g_model`)?"
   — Yes = full headline treatment (what V4 Pro and M3 got). No = leave the current default; only
   swap banner/modal/preset.
2. **Preset hardware?** "Feature `DISPLAY` across all GPUs, or restrict to specific ones?"
   — Default = all GPUs: `['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300', 'mi300x', 'mi325x', 'mi355x']`.
   Only narrow it if the user says so (e.g. NVIDIA-only at launch).

## Step 3 — Find the outgoing (current) day-0 model

Don't assume it's DeepSeek V4 Pro — detect it:

- In `packages/app/src/components/favorites/favorite-presets.ts`, the current launch preset is the
  **single visible** (`hidden` not set) entry whose `id` ends in `-launch` (first in
  `FAVORITE_PRESETS`). Note its `id` (call it `OLD_PRESET_ID`).
- In `packages/app/src/lib/nudges/registry.tsx`, find the `*-launch-banner` and `*-launch-modal`
  nudge objects (the "Landing banner" and the launch entry under "Landing modals"). Note their
  `storageKey`s.

## Step 4 — Quick Comparisons preset (`favorite-presets.ts`)

1. **Retire the old preset**: on the current visible `OLD_PRESET_ID` entry, add `hidden: true` and
   update its leading comment to note it was retired when `DISPLAY` became the day-0 model and is
   kept so `?preset=OLD_PRESET_ID` links (banner, modal, external shares, blog CTAs) keep working.
   (Same pattern already used for `dsv4-launch-nvidia`.)
2. **Add the new preset** as the **first** element of `FAVORITE_PRESETS`:
   ```ts
   // 0 — DISPLAY launch (all configs) — current day-0 featured model
   {
     id: 'SLUG-launch',
     title: 'DISPLAY — First Look',
     description:
       'First benchmarks of DISPLAY across every available GPU. New configurations appear here as they come online.',
     tags: [/* vendor + version + */ 'New'],   // e.g. ['MiniMax', 'M3', 'New']
     category: 'comparison',
     wide: true,
     config: {
       model: ENUM,
       sequence: Sequence.EightK_OneK,
       precisions: ['fp4', 'fp4fp8', 'fp8'],
       yAxisMetric: 'y_tpPerGpu',
       hwFilter: [/* answer from Step 2.2 */],
     },
   },
   ```

## Step 5 — Launch banner + modal (`registry.tsx`)

Rewrite the two launch nudges (replace the old ones in place — there is only ever one launch
banner + one launch modal at a time):

**Modal** (under "Landing modals"):

- `id: 'SLUG-launch-modal'`
- `storageKey: 'inferencex-SLUG-modal-dismissed'` ← new key so dismissed users see it again
- `title: 'DISPLAY is live'`
- `description: 'Day-zero benchmarks for DISPLAY are now available across the latest NVIDIA and AMD GPUs. Results are experimental — see how the new model performs across hardware.'`
- `testId: 'launch-modal'` ← keep launch-agnostic; do not model-name it
- `primaryAction.onClick` → `window.location.href = '/inference?preset=SLUG-launch'`
- `analytics`: `SLUG__modal_shown` / `SLUG__modal_dismissed` / `SLUG__modal_explored`
  (use the underscored `SLUG_`, e.g. `minimax_m3_modal_shown`)

**Banner** (under "Landing banner"):

- `id: 'SLUG-launch-banner'`
- `storageKey: 'inferencex-SLUG-banner-dismissed'`
- `title: 'DISPLAY benchmarks are live'`
- `description: 'First inference numbers across NVIDIA and AMD GPUs, click to explore.'`
- `testId: 'launch-banner'` ← keep launch-agnostic
- `href` + `onLinkClick` → `'/inference?preset=SLUG-launch'`
- `analytics`: keep the generic `launch_banner_shown` / `_dismissed` / `_clicked`, and set
  `properties: { banner_id: 'SLUG-launch', preset_id: 'SLUG-launch' }`

## Step 6 — Default model (only if Step 2.1 = Yes)

In `packages/app/src/lib/url-state.ts`, set `PARAM_DEFAULTS.g_model` to `'G_MODEL'`
(must equal the `Model.*` string value, e.g. `'MiniMax-M3'`).

## Step 7 — Sync tests

- `packages/app/src/lib/nudges/registry.test.ts` — in the **sorted** expected-ids array in
  "contains the expected set of migrated nudges", replace the old `*-launch-banner`/`*-launch-modal`
  ids with `SLUG-launch-banner`/`SLUG-launch-modal` (keep the array alphabetically sorted).
- `packages/app/cypress/e2e/nudge-system.cy.ts` — replace the old modal/banner storage keys with
  `inferencex-SLUG-modal-dismissed` / `inferencex-SLUG-banner-dismissed`. The testId selectors are
  already generic (`launch-modal`, `launch-banner`) so they need no change once Step 5 keeps them
  generic. Update any human-readable `it(...)` titles that name the old model.
- `packages/app/cypress/e2e/navigation.cy.ts` — same storage-key renames.
- **Only if Step 6 changed the default** — `packages/app/src/lib/url-state.test.ts` has two specs
  that hardcode the old default (`has expected default for g_model`, and the
  "removes params that match their default value" test that writes the default `g_model`). Update
  both to `'G_MODEL'`.

> Do **not** touch: blog MDX `?g_model=…` / `?preset=OLD_PRESET_ID` links (historical, correct),
> `packages/constants/src/models.ts` DB-key maps, or model-architecture/data-mapping entries for the
> outgoing model — it still exists, it's just no longer the headline.

## Step 8 — Verify & report

Run and report results:

- `pnpm typecheck`
- `pnpm lint && pnpm fmt`
- `pnpm --filter *app test:unit` (runs `registry.test.ts`)

Then sanity-check for leftovers:

```
rg -n "OLD_PRESET_ID-modal|OLD_PRESET_ID-banner|inferencex-<old-slug>-modal-dismissed|inferencex-<old-slug>-banner-dismissed" packages --glob '!node_modules'
```

(should only surface the intentional hidden preset + blog links).

Remind the user that the final gate is `pnpm test:e2e` (Cypress) plus a manual check at `pnpm dev`:
load `/` → banner reads "DISPLAY benchmarks are live", modal reads "DISPLAY is live", Quick
Comparisons leads with "DISPLAY — First Look", and (if chosen) the dashboard opens on `DISPLAY`.
Spot-check `/inference?preset=SLUG-launch` renders real data (if data is still landing, the preset
self-fills as configs come online — acceptable).

**Do not commit or push** — leave that to the user (per repo policy, every push needs explicit
per-instance permission).
