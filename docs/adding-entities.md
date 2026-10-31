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
> Does this look right? What category: default, experimental, maintenance, deprecated, or hidden?
> Any extra HF/mount paths?

### Then apply

**`packages/constants/src/models.ts`**:

- Add to `DB_MODEL_TO_DISPLAY` (`dbKey: 'Display Name'`)

**`packages/db/src/etl/normalizers.ts`**:

- `MODEL_TO_KEY` — add paths visible in the run's job names and artifact names (HF paths, mount paths). Don't speculatively add paths you haven't seen.
- `PREFIX_ALIASES` — **skip if the prefix matches the DB key after stripping precision suffixes** (the common case). Only needed for non-obvious aliases (e.g. `gptoss` → `gptoss120b`).

**`packages/app/src/lib/catalog/data-mappings.ts`**:

1. `Model` enum — add member (value must match display name in `DB_MODEL_TO_DISPLAY`)
2. `MODEL_CONFIG` — add one entry with `{ label, prefix, category }`

Everything else (`MODEL_OPTIONS`, `DEFAULT_MODELS`, `EXPERIMENTAL_MODELS`, `DEPRECATED_MODELS`, `MODEL_PREFIX_MAPPING`, `getModelLabel()`) is derived automatically.

**`packages/app/src/lib/compare/compare-slug.ts`** (easy to miss — the /compare and /compare-per-dollar pages do NOT derive from `MODEL_CONFIG`):

- Add a `COMPARE_MODEL_SLUGS` entry with `{ slug, displayName, dbKeys, label, seoName }`. `displayName` must match the `Model` enum value, and `dbKeys` lists the DB buckets to query. Without this entry the model is absent from /compare, /compare-per-dollar, the sitemap, and their OG images.
- `COMPARE_MODEL_ALIASES` — only if a family-level or older-version slug should 308 to the new entry.

**`packages/app/src/lib/compare/compare-ssr.ts`**:

- `KNOWN_MODELS` — add the display name so `?g_model=` URL overrides validate on compare pages.

**`packages/app/src/app/compare/page.tsx`** and **`packages/app/src/app/compare-per-dollar/page.tsx`**, plus their `packages/app/src/app/zh/` copies:

- Each `DESCRIPTION` SEO meta string hardcodes a sample model list. Add the new model if it should appear in the catalog blurb.

**`packages/app/src/lib/catalog/model-architectures.ts`** (optional — powers the per-model architecture diagram on the inference tab):

- `MODEL_ARCHITECTURES` — add a `[Model.X]` entry with verified config.json values. Omitted models simply render no diagram (`getModelArchitecture` returns `undefined`), so this is non-blocking but expected for parity with other models.

`/about` needs no change — its model list derives from `DB_MODEL_TO_DISPLAY` and includes the new key automatically once `models.ts` is updated.

---

## Featuring a Day-0 Model

Only a model that already exists can be featured (see [Adding a New Model](#adding-a-new-model)). The promotion surfaces are the landing banner and modal in `packages/app/src/lib/nudges/registry.tsx` and the visible `*-launch` preset at the top of `FAVORITE_PRESETS` in `packages/app/src/components/favorites/favorite-presets.ts`.

Each launch **replaces** the previous launch's surfaces rather than editing them in place. Use new storage keys, so users who dismissed the previous banner or modal still see the new one. Keep the old preset but set `hidden: true` instead of deleting it, because existing `?preset=<old-slug>-launch` links in old banners, external shares and blog `DashboardCTA`s must keep resolving. Keep the generic testIds (`launch-banner`, `launch-modal`) so Cypress selectors don't change every launch.

---

## Adding a New GPU

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). From artifacts, infer the base GPU key.

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **base GPU key**? (canonical lowercase, e.g. `l20`, `h200`)
2. What **vendor** and **architecture codename**? (e.g. NVIDIA Blackwell, AMD CDNA 4)
3. What is the **display label**? (e.g. `H200`, `GB200 NVL72`)
4. What is the **all-in power per GPU** in kW?
5. What are the **cost rates** in $/GPU/hr? (owning at large hyperscaler volume, rent on a 3-year commit)
6. What is the **TDP** in watts?
7. Where should it **sort** relative to existing GPUs in legends? (lower = first)
8. Do you have the **full hardware specs** for the GPU Specs tab? (memory GB, memory bandwidth TB/s, FP4/FP8/BF16 TFLOPS, interconnect tech, scale-up bandwidth, NIC model, scale-out topology)

### Then apply

**`packages/constants/src/gpu-keys.ts`** (single source of truth):

- Add one entry to `HW_REGISTRY` with all fields: `vendor`, `arch`, `label`, `sort`, `tdp`, `power`, `costh`, `costr`. **If power/cost are unknown, use `9.99` as an obvious placeholder** — the test suite requires `power > 0`.
- If this is a **new vendor** (one without zones in `VENDOR_OKLCH_ZONES` yet), also add color zones to `VENDOR_OKLCH_ZONES` and `VENDOR_HSL_ZONES` in the same file, and extend the `Vendor` type and `getVendor()` in `src/lib/charts/dynamic-colors.ts`.

**`packages/db/src/etl/normalizers.ts`** (usually no change):

- `hwToGpuKey()` lowercases the hardware name and keeps only the text before the first `-`, so artifact suffixes need no mapping and GPU keys cannot contain `-`. Add a `HW_ALIASES` entry only when that text differs from the GPU key (e.g. `vrnvl72` → `vr200`).

**`packages/app/src/lib/catalog/gpu-specs.ts`** (if specs provided):

- Add `GpuSpec` entry with full hardware data
- Add topology config in `getTopologyConfig()` / `getScaleUpTopologyConfig()`

**No other files need changes.** Display labels, sort order, cost/power data, framework variant configs, and chart colors are all derived automatically from `HW_REGISTRY`.

---

## Adding a New Precision

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). From artifacts, infer the precision key from the segment after the model prefix (e.g. `fp8` from `bmk_dsr1_1k1k_fp8_sglang_...`).

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **key**? (lowercase, e.g. `fp4`, `fp8`)
2. What is the **display label**? (e.g. `FP4`, `FP8`)
3. Does this precision appear as a **suffix on model prefix names** in artifacts? (e.g. `dsr1-mxfp4`)

### Then apply

**`packages/db/src/etl/normalizers.ts`**:

- `PRECISION_SUFFIX` regex — add the keyword if it appears as a model name suffix

**`packages/app/src/lib/catalog/data-mappings.ts`**:

1. `Precision` enum — add member
2. `PRECISION_CONFIG` — add one entry with `{ label }`

Everything else (`PRECISION_OPTIONS`, `getPrecisionLabel()`) is derived automatically.

Chart shapes need no change. `getShapeKeyForPrecision()` in `packages/app/src/lib/charts/chart-rendering.ts` assigns shapes by the precision's position among the selected precisions.

---

## Adding a New Sequence Length

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). From artifacts, infer the sequence from the `{n}k{m}k` segment (e.g. `16k8k` from `bmk_dsr1_16k8k_fp8_sglang_...`).

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **display string**? (e.g. `1K/1K`, `1K/8K`)
2. What are the **ISL and OSL in tokens**? (e.g. 1024 input, 1024 output)

### Then apply

**`packages/constants/src/models.ts`**:

1. `sequenceToIslOsl()` — add forward mapping
2. `islOslToSequence()` — add reverse mapping

**`packages/app/src/lib/catalog/data-mappings.ts`**:

1. `Sequence` enum — add member
2. Add a `SEQUENCE_CONFIG` entry with `{ label, labelZh, compact, category, kind }`

Everything else (`SEQUENCE_OPTIONS`, `SEQUENCE_PREFIX_MAPPING`, `getSequenceLabel()`) is derived automatically.

No ingest changes needed — `parseIslOsl()` regex handles any `{n}k{m}k` pattern.

---

## Adding a New Framework

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). From artifacts, infer the framework from the segment after the precision (e.g. `sglang` from `bmk_dsr1_1k1k_fp8_sglang_tp8-...`).

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **framework name** as it appears in artifact names? (e.g. from `bmk_glm5_1k1k_fp8_sglang_tp8-...`, the framework segment is `sglang`)
2. Does it need **normalization**? Currently `sglang-disagg` in raw data is normalized to `mori-sglang` (AMD MoRI). Similarly `dynamo-trtllm` → `dynamo-trt` (rename). Should this new framework be stored as-is, or renamed?

> **Note:** When asking the user, show concrete examples from the artifacts — quote the exact artifact name and highlight which segment you're reading as the framework. Don't ask vague questions. You **MUST** include the normalization example in question 2 (currently `sglang-disagg` → `mori-sglang`, `dynamo-trtllm` → `dynamo-trt`) so the user understands what "normalization" means concretely.

### Then apply

**`packages/constants/src/framework-aliases.ts`** (single source of truth):

- Add one entry to `FW_REGISTRY` with `{ label }` (the display name)
- If the framework is a **rename/alias** of an existing one, add to `FRAMEWORK_ALIASES` instead

**No other files need changes.** `normalizeFramework()` resolves raw names through `FRAMEWORK_ALIASES`, and display labels, `FRAMEWORK_KEYS`, and `FRAMEWORK_LABELS` are derived from `FW_REGISTRY` and `FRAMEWORK_ALIASES`.

---

## After applying (all entity types)

**Always offer to ingest and refresh the cache** after adding any entity. Ask only whether to refresh a local server or the public dashboard, then follow [Manual Run Ingest](./ingesting-runs.md).

```bash
bun run admin:db:ingest:run <run-url-or-id>  # needs DATABASE_WRITE_URL and GITHUB_TOKEN
bun run admin:cache:invalidate <url>         # needs INVALIDATE_SECRET, defaults to http://localhost:3000
```

For the public dashboard, dispatch `cache-refresh.yml` instead of running the invalidate script.

> **Note:** If the run was already ingested (e.g. mappings were added in `packages/db` before the frontend), you'll see `0 new, N duplicate` — this is expected. The rows already exist; the ingest confirms they resolve correctly with the new mappings.
