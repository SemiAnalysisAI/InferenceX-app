# Adding Models, GPUs, Precisions, and Sequences

Instructions for Claude agents implementing new entity additions.

> **CRITICAL: Mappings must be deployed before first ingest.**
>
> If data for a new model or GPU is ingested before the normalizer mappings exist, those rows are **silently skipped** — `resolveModelKey()` / `hwToGpuKey()` returns `null`, the skip tracker logs them, but nothing is written to the DB. The data isn't lost (source artifacts remain in GCS), but recovering requires a full re-ingest after adding the mappings.
>
> **Always warn the user:** the `packages/db` and `packages/constants` changes (normalizers, GPU_KEYS, DB_MODEL_TO_DISPLAY) must be merged and deployed before the first benchmark run containing the new entity. Frontend changes can follow later otherwise the new entity will be missing from dropdowns and charts.

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

---

## Adding a New GPU

### Infer from artifacts

Ask for the run URL first (see [Workflow](#workflow)). The user may not have one if adding preemptively, but having a run massively raises chances of getting it right first try. From artifacts, infer the base GPU key and any suffixes.

### Ask the user to confirm

Present what you inferred and ask about anything not visible in artifacts:

1. What is the **base GPU key**? (canonical lowercase, e.g. `l20`, `h200`)
2. What **vendor**: NVIDIA, AMD, or other?
3. What is the **all-in power per GPU** in kW? Does it depend on framework variant? etc.
4. What are the **cost rates** in $/GPU/hr? (hyperscaler, neocloud, 3-year rental)
5. Which **framework variants** will run on it? (e.g. `sglang`, `trt`, `dynamo-trt`, `vllm`, with/without `mtp`)
6. Where should it **sort** relative to existing GPUs in legends?
7. Are there any **new artifact suffixes** for this GPU beyond the existing ones (`-trt`, `-nv`, `-amds`, `-amd`, `-nvd`, `-nvs`, `-disagg`, `-multinode-slurm`, `-dgxc-slurm`, `-dgxc`, `-nb`)?
8. Do you have the **full hardware specs** for the GPU Specs tab? (memory GB, memory bandwidth TB/s, FP4/FP8/BF16 TFLOPS, interconnect tech, scale-up bandwidth, NIC model, scale-out topology)

### Then apply

**`packages/constants/src/gpu-keys.ts`**:

- Add to `GPU_KEYS` Set

**`packages/db/src/etl/normalizers.ts`**:

- `hwToGpuKey()` — add `.replace()` for any new suffixes

**`packages/app/src/lib/constants.ts`**:

1. `GPU_SPECS` — add `{ power, costh, costn, costr }`. **If power/cost are unknown, use `9.99` as an obvious placeholder** — the test suite requires `power > 0`.
2. `HARDWARE_CONFIG` — add entry per variant (`base`, `base-sglang`, `base-trt`, etc.) with `name`, `label`, `suffix`, `gpu`, `color`
3. `MODEL_ORDER` — add prefix string at desired sort position
4. `COLOR_FAMILIES` — if the vendor is **not NVIDIA or AMD**, add a new color family (e.g. `aws: [...]`)
5. `getColorFamily()` — add vendor detection for the new GPU key prefix (e.g. `hwKey.startsWith('trainium')`)

**`packages/app/src/app/globals.css`**:

- Add `--<hwKey>: oklch(...)` and `--color-<hwKey>: var(--<hwKey>)` per variant. Use green hues for NVIDIA, red for AMD, yellow-orange for AWS. Gradient from light to dark within each GPU's variants.

**`packages/app/src/lib/gpu-specs.ts`** (if specs provided):

- Add `GpuSpec` entry with full hardware data
- Add topology config in `getTopologyConfig()` / `getScaleUpTopologyConfig()`

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
3. Which **GPUs** will use this framework, if any already known? (determines HARDWARE_CONFIG variants needed)

> **Note:** When asking the user, show concrete examples from the artifacts — quote the exact artifact name and highlight which segment you're reading as the framework. Don't ask vague questions. You **MUST** include the normalization example in question 2 (currently `sglang-disagg` → `mori-sglang`, `dynamo-trtllm` → `dynamo-trt`) so the user understands what "normalization" means concretely.

### Then apply

**`packages/db/src/etl/normalizers.ts`**:

- `normalizeFramework()` — add special case only if name needs transformation

**`packages/app/src/lib/constants.ts`**:

- `HARDWARE_CONFIG` — add entries per GPU+framework combination

**`packages/app/src/app/globals.css`**:

- Add CSS color variables for the new framework variants

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
