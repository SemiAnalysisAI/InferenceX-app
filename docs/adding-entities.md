# Adding Models, GPUs, Precisions, and Sequences

Instructions for Claude agents implementing new entity additions.

> **CRITICAL: Mappings must be deployed before first ingest.**
>
> If data for a new model or GPU is ingested before the normalizer mappings exist, those rows are **silently skipped** — `resolveModelKey()` / `hwToGpuKey()` returns `null`, the skip tracker logs them, but nothing is written to the DB. The data isn't lost (source artifacts remain in GCS), but recovering requires a full re-ingest after adding the mappings.
>
> **Always warn the user:** the `packages/db` and `packages/constants` changes (normalizers, HW_REGISTRY, DB_MODEL_TO_DISPLAY) must be merged and deployed before the first benchmark run containing the new entity. Frontend changes can follow later otherwise the new entity will be missing from dropdowns and charts.

---

## Workflow

When asked to add a new model, GPU, or other entity:

1. **Immediately ask for the PR or GitHub Actions run URL** — for any entity type (model, GPU, precision, sequence, framework). This is the absolute first thing — do NOT read files, do NOT ask other questions yet. The user may not have one if adding preemptively, but having a run massively raises chances of getting it right first try.
2. **Read the run details** — parse owner/repo from the URL path (e.g. `SemiAnalysisAI/InferenceX` from `github.com/SemiAnalysisAI/InferenceX/actions/runs/...`), then run both in parallel:
   - `gh api repos/<owner>/<repo>/actions/runs/<id> --jq '.name'` — PR title/body, often has model, HF path, GPU, framework, config key
   - `gh run view <id> --repo <owner>/<repo>` (NOT `--log`) — job names and artifact names always contain model prefix, GPU, framework, precision, sequences
3. **Extract**: DB key/prefix from artifact names (e.g. `glm5` from `bmk_glm5_1k1k_...`), HF paths from job names (e.g. `zai-org/GLM-5-FP8`), GPU, framework, precision, sequence lengths.
4. **Present what you inferred** and only ask about fields that can't be determined from artifacts (category, display name preferences, cost rates, hardware specs, etc.).
5. **Read all target files in parallel** before making any edits — minimizes round trips.
6. Apply the changes per the checklists below.

> **Agent tips:**
>
> - **TypeScript catches missing config entries.** Every enum uses `Record<Enum, ...>`, so adding an enum member without the corresponding config entry causes a type error. This is a safety net — just add the missing entry.
> - **No DB schema or ingest pipeline changes are needed** for any entity type. The schema is open-ended and the ingest is fully parameterized. Don't waste time reading ingest files.

---

## Adding a New Model

### Infer from artifacts

From the GitHub Actions run, extract:

- **DB key** / **`infmax_model_prefix`**: the prefix in artifact names (e.g. `glm5` from `bmk_glm5_1k1k_...`)
- **HuggingFace paths**: the model path in job names (e.g. `zai-org/GLM-5-FP8`)
- **Display name**: derive from HF path, stripping org prefix and precision suffix (e.g. `GLM-5`)
- **Human-readable label**: spaces instead of hyphens (e.g. `GLM 5`)

### Ask the user to confirm

Present what you inferred and get confirmation + category in a single step. Include a suggested category and ask if anything needs changing. Example:

> Inferred from artifacts:
>
> - DB key: `glm5`, Display: `GLM-5`, Label: `GLM 5`
> - HF path: `zai-org/GLM-5-FP8`
>
> Does this look right? What category: default, experimental, or deprecated?
> Any extra HF/mount paths?

### Then apply

**`packages/constants/src/models.ts`**:

- Add to `DB_MODEL_TO_DISPLAY` (`dbKey: 'Display Name'`)

**`packages/db/src/etl/normalizers.ts`**:

- `MODEL_TO_KEY` — add paths visible in the run's job names and artifact names (HF paths, mount paths). Don't speculatively add paths you haven't seen.
- `PREFIX_ALIASES` — **skip if the prefix matches the DB key after stripping precision suffixes** (the common case). Only needed for non-obvious aliases (e.g. `gptoss` → `gptoss120b`).

**`packages/app/src/lib/data-mappings.ts`**:

1. `Model` enum — add member (value must match display name in `DB_MODEL_TO_DISPLAY`)
2. `MODEL_CONFIG` — add one entry with `{ label, prefix, category }`

Everything else (`MODEL_OPTIONS`, `DEFAULT_MODELS`, `EXPERIMENTAL_MODELS`, `DEPRECATED_MODELS`, `MODEL_PREFIX_MAPPING`, `getModelLabel()`) is derived automatically.

**`packages/app/src/lib/compare-slug.ts`** (easy to miss — the /compare and /compare-per-dollar pages do NOT derive from `MODEL_CONFIG`):

- `COMPARE_MODEL_SLUGS` — add an entry with `{ slug, displayName, dbKeys, label }`. `displayName` must match the `Model` enum value; `dbKeys` lists the DB buckets to query. Place it per the ordering comment (Chinese-lab flagships first, newer family member leads). Without this entry the model is absent from /compare, /compare-per-dollar, the sitemap, and their OG images.
- `COMPARE_MODEL_ALIASES` — only if a family-level or older-version slug should 308 to the new entry.

**`packages/app/src/lib/compare-ssr.ts`**:

- `KNOWN_MODELS` — add the display name so `?g_model=` URL overrides validate on compare pages.

**`packages/app/src/app/compare/page.tsx`** and **`packages/app/src/app/compare-per-dollar/page.tsx`**:

- `DESCRIPTION` — these SEO meta strings hardcode a sample model list ("…, Qwen 3.5 397B-A17B, and more"). Add the new model if it should appear in the catalog blurb.

**`packages/app/src/lib/model-architectures.ts`** (optional — powers the per-model architecture diagram on the inference tab):

- `MODEL_ARCHITECTURES` — add a `[Model.X]` entry with verified config.json values. Omitted models simply render no diagram (`getModelArchitecture` returns `undefined`), so this is non-blocking but expected for parity with other models.

`/about` needs no change — its model list derives from `DB_MODEL_TO_DISPLAY` and includes the new key automatically once `models.ts` is updated.

---

## Featuring a Day-0 Model

When a new model launches and we want to give it the headline treatment, swap the **promotion surfaces** to it. This is separate from [Adding a New Model](#adding-a-new-model) above — the model must **already exist** (`Model.*` enum, `MODEL_CONFIG`, DB mapping) before it can be featured. The promotion surfaces are:

- **Launch banner** — the dismissible bar at the top of the landing page
- **Launch modal** — the "X is live" popup on the landing page
- **Quick Comparisons preset** — the "X — First Look" card (first entry in `FAVORITE_PRESETS`)
- **Default model** (optional) — the model the dashboard opens on (`g_model`)

### The "retire old, new IDs" pattern

Each launch **replaces** the previous day-0 model's surfaces rather than editing them in place. This is deliberate:

- **New storage keys** (`inferencex-<slug>-{banner,modal}-dismissed`) so users who dismissed the _previous_ launch banner/modal still see the new one.
- **Keep the old preset, hide it** (`hidden: true`) instead of deleting it — existing `?preset=<old-slug>-launch` links (old banners, modals, external shares, blog `DashboardCTA`s) must keep resolving.
- **Generic testIds** (`launch-banner`, `launch-modal`) — launch-agnostic so Cypress selectors don't change every launch.

> The current day-0 model is **whatever the single visible (`hidden` unset) `*-launch` preset points to** — detect it, don't assume. As of MiniMax M3 it was DeepSeek V4 Pro.

### Derive the identifiers

From the model name, derive (MiniMax M3 shown as the worked example):

| Token     | Example            | Used in                                        |
| --------- | ------------------ | ---------------------------------------------- |
| `SLUG`    | `minimax-m3`       | preset id, nudge ids, storage keys, `?preset=` |
| `SLUG_`   | `minimax_m3`       | analytics event names                          |
| `ENUM`    | `Model.MiniMax_M3` | preset `config.model`                          |
| `DISPLAY` | `MiniMax M3`       | all user-facing copy                           |
| `G_MODEL` | `MiniMax-M3`       | `g_model` default (the `Model.*` string value) |

### Then apply

**`packages/app/src/components/favorites/favorite-presets.ts`**:

1. On the outgoing visible `*-launch` preset, add `hidden: true` and update its comment (retired, kept for link compat — same pattern as the existing `dsv4-launch-nvidia` entry).
2. Prepend a new visible preset as the **first** element of `FAVORITE_PRESETS`:
   ```ts
   {
     id: 'SLUG-launch',
     title: 'DISPLAY — First Look',
     description:
       'First benchmarks of DISPLAY across every available GPU. New configurations appear here as they come online.',
     tags: ['<Vendor>', '<Version>', 'New'], // e.g. ['MiniMax', 'M3', 'New']
     category: 'comparison',
     wide: true,
     config: {
       model: ENUM,
       sequence: Sequence.EightK_OneK,
       precisions: ['fp4', 'fp4fp8', 'fp8'],
       yAxisMetric: 'y_tpPerGpu',
       hwFilter: ['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300', 'mi300x', 'mi325x', 'mi355x'],
     },
   }
   ```
   Narrow `hwFilter` only for a restricted launch (e.g. NVIDIA-only). The broad filter + "as they come online" copy is the intended self-filling behavior even when data is still partial at launch.

**`packages/app/src/lib/nudges/registry.tsx`** — rewrite the two launch nudges (only one banner + one modal exist at a time):

- **Modal** (under "Landing modals"): `id: 'SLUG-launch-modal'`, `storageKey: 'inferencex-SLUG-modal-dismissed'`, `title: 'DISPLAY is live'`, day-zero `description`, `testId: 'launch-modal'`, `primaryAction.onClick` → `/inference?preset=SLUG-launch`, analytics `SLUG_modal_shown`/`_dismissed`/`_explored`.
- **Banner** (under "Landing banner"): `id: 'SLUG-launch-banner'`, `storageKey: 'inferencex-SLUG-banner-dismissed'`, `title: 'DISPLAY benchmarks are live'`, `testId: 'launch-banner'`, `href`/`onLinkClick` → `/inference?preset=SLUG-launch`, keep the generic `launch_banner_*` analytics events but set `properties: { banner_id: 'SLUG-launch', preset_id: 'SLUG-launch' }`.

**`packages/app/src/lib/url-state.ts`** _(only if making it the site default)_:

- Set `PARAM_DEFAULTS.g_model` to `'G_MODEL'`. Most launches **leave this unchanged** — only change it for a true flagship (DeepSeek V4 Pro got it; MiniMax M3 did not).

### Sync tests

- **`packages/app/src/lib/nudges/registry.test.ts`** — update the **sorted** expected-ids array ("contains the expected set of migrated nudges") to the new `SLUG-launch-banner`/`SLUG-launch-modal` ids.
- **`packages/app/cypress/e2e/nudge-system.cy.ts`** and **`navigation.cy.ts`** — replace the old `inferencex-<old-slug>-{modal,banner}-dismissed` storage keys with the new ones. TestId selectors stay generic (`launch-modal`, `launch-banner`); update any `it(...)` titles that name the old model.
- **`packages/app/src/lib/url-state.test.ts`** _(only if the default changed)_ — two specs hardcode the default `g_model`; update both.

> **Don't touch:** blog MDX `?g_model=…` / `?preset=<old-slug>-launch` links (historical, correct), `packages/constants/src/models.ts` DB-key maps, or the outgoing model's data-mapping / architecture entries — it still exists, it's just no longer the headline.

### Verify

`pnpm typecheck && pnpm lint && pnpm fmt && pnpm test:unit`, then `rg` for the old slug to confirm only the intentional hidden preset + blog links remain. Final gate: `pnpm test:e2e` and a manual `pnpm dev` check that the banner/modal/preset read `DISPLAY` and `/inference?preset=SLUG-launch` renders data.

---

## Adding a New GPU

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). The user may not have one if adding preemptively, but having a run massively raises chances of getting it right first try. From artifacts, infer the base GPU key and any suffixes.

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **base GPU key**? (canonical lowercase, e.g. `l20`, `h200`)
2. What **vendor** and **architecture codename**? (e.g. NVIDIA Blackwell, AMD CDNA 4)
3. What is the **display label**? (e.g. `H200`, `GB200 NVL72`)
4. What is the **all-in power per GPU** in kW?
5. What are the **cost rates** in $/GPU/hr? (hyperscaler, neocloud, retail)
6. What is the **TDP** in watts?
7. Where should it **sort** relative to existing GPUs in legends? (lower = first)
8. Are there any **new artifact suffixes** for this GPU beyond the existing ones (`-trt`, `-nv`, `-amds`, `-amd`, `-nvd`, `-nvs`, `-disagg`, `-multinode-slurm`, `-dgxc-slurm`, `-dgxc`, `-nb`)?
9. Do you have the **full hardware specs** for the GPU Specs tab? (memory GB, memory bandwidth TB/s, FP4/FP8/BF16 TFLOPS, interconnect tech, scale-up bandwidth, NIC model, scale-out topology)

### Then apply

**`packages/constants/src/gpu-keys.ts`** (single source of truth):

- Add one entry to `HW_REGISTRY` with all fields: `vendor`, `arch`, `label`, `sort`, `tdp`, `power`, `costh`, `costn`, `costr`. **If power/cost are unknown, use `9.99` as an obvious placeholder** — the test suite requires `power > 0`.
- If this is a **new vendor** (not NVIDIA or AMD), also add color zones to `VENDOR_OKLCH_ZONES` and `VENDOR_HSL_ZONES` in the same file, and extend the `Vendor` type in `src/lib/dynamic-colors.ts`.

**`packages/db/src/etl/normalizers.ts`**:

- `hwToGpuKey()` — add `.replace()` for any new artifact suffixes

**`packages/app/src/lib/gpu-specs.ts`** (if specs provided):

- Add `GpuSpec` entry with full hardware data
- Add topology config in `getTopologyConfig()` / `getScaleUpTopologyConfig()`

**No other files need changes.** Display labels, sort order, cost/power data, framework variant configs, and chart colors are all derived automatically from `HW_REGISTRY`.

---

## Adding a New Precision

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). The user may not have one if adding preemptively, but having a run massively raises chances of getting it right first try. From artifacts, infer the precision key from the segment after the model prefix (e.g. `fp8` from `bmk_dsr1_1k1k_fp8_sglang_...`).

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **key**? (lowercase, e.g. `fp4`, `fp8`)
2. What is the **display label**? (e.g. `FP4`, `FP8`)
3. What **chart shape** should it use? Existing: FP4 = circle (default), FP8 = square, BF16 = triangle, INT4 = diamond. Pick one or describe a new shape.
4. Does this precision appear as a **suffix on model prefix names** in artifacts? (e.g. `dsr1-mxfp4`)

### Then apply

**`packages/db/src/etl/normalizers.ts`**:

- `PRECISION_SUFFIX` regex — add the keyword if it appears as a model name suffix

**`packages/app/src/lib/data-mappings.ts`**:

1. `Precision` enum — add member
2. `PRECISION_CONFIG` — add one entry with `{ label }`

Everything else (`PRECISION_OPTIONS`, `getPrecisionLabel()`) is derived automatically.

**`packages/app/src/lib/chart-rendering.ts`** (if new shape):

- `SHAPE_CONFIG` — add shape definition with normal/hover states
- `getShapeConfig()` — add condition

---

## Adding a New Sequence Length

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). The user may not have one if adding preemptively, but having a run massively raises chances of getting it right first try. From artifacts, infer the sequence from the `{n}k{m}k` segment (e.g. `16k8k` from `bmk_dsr1_16k8k_fp8_sglang_...`).

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **display string**? (e.g. `1K/1K`, `1K/8K`)
2. What are the **ISL and OSL in tokens**? (e.g. 1024 input, 1024 output)

### Then apply

**`packages/constants/src/models.ts`**:

1. `sequenceToIslOsl()` — add forward mapping
2. `islOslToSequence()` — add reverse mapping

**`packages/app/src/lib/data-mappings.ts`**:

1. `Sequence` enum — add member
2. `SEQUENCE_CONFIG` — add one entry with `{ label, compact }`

Everything else (`SEQUENCE_OPTIONS`, `SEQUENCE_PREFIX_MAPPING`, `getSequenceLabel()`) is derived automatically.

No ingest changes needed — `parseIslOsl()` regex handles any `{n}k{m}k` pattern.

---

## Adding a New Framework

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). The user may not have one if adding preemptively, but having a run massively raises chances of getting it right first try. From artifacts, infer the framework from the segment after the precision (e.g. `sglang` from `bmk_dsr1_1k1k_fp8_sglang_tp8-...`).

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **framework name** as it appears in artifact names? (e.g. from `bmk_glm5_1k1k_fp8_sglang_tp8-...`, the framework segment is `sglang`)
2. Does it need **normalization**? Currently `sglang-disagg` in raw data is normalized to `mori-sglang` (AMD MoRI). Similarly `dynamo-trtllm` → `dynamo-trt` (rename). Should this new framework be stored as-is, or renamed?

> **Note:** When asking the user, show concrete examples from the artifacts — quote the exact artifact name and highlight which segment you're reading as the framework. Don't ask vague questions. You **MUST** include the normalization example in question 2 (currently `sglang-disagg` → `mori-sglang`, `dynamo-trtllm` → `dynamo-trt`) so the user understands what "normalization" means concretely.

### Then apply

**`packages/constants/src/framework-aliases.ts`** (single source of truth):

- Add one entry to `FW_REGISTRY` with `{ label }` (the display name)
- If the framework is a **rename/alias** of an existing one, add to `FRAMEWORK_ALIASES` instead

**`packages/db/src/etl/normalizers.ts`**:

- `normalizeFramework()` — add special case only if name needs transformation

**No other files need changes.** Display labels, `FRAMEWORK_KEYS`, and `FRAMEWORK_LABELS` are all derived automatically from `FW_REGISTRY` and `FRAMEWORK_ALIASES`.

---

## What doesn't need changing

- **DB schema** — all columns are open-ended text/integer, no migrations needed
- **Ingest pipeline** — `config-cache.ts`, `benchmark-ingest.ts`, `eval-ingest.ts` are fully parameterized
- **New metrics** — auto-captured as JSONB; only add to `KNOWN_METRIC_RAW_KEYS` in `benchmark-mapper.ts` to suppress warnings
- **Prefix resolution** — if `infmax_model_prefix` matches the DB key (after stripping precision suffixes like `-fp8`), no `PREFIX_ALIASES` entry is needed

## After applying (all entity types)

**Always offer to ingest and invalidate** after adding any entity. Ask only which invalidation URL to use (`http://localhost:3000` or `https://inferencex.semianalysis.com`).

```bash
pnpm admin:db:ingest:run <run-url-or-id>
pnpm admin:cache:invalidate <url>
```

Both require `DATABASE_WRITE_URL` and `GITHUB_TOKEN` env vars.

> **Note:** If the run was already ingested (e.g. mappings were added in `packages/db` before the frontend), you'll see `0 new, N duplicate` — this is expected. The rows already exist; the ingest confirms they resolve correctly with the new mappings.

## Verify

After all changes:

```bash
pnpm typecheck
pnpm test:unit
```
