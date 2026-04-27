# Intel Gaudi 3 Benchmark Ingest — Developer Guide

This branch (`gaudi3-preview`) hosts an isolated preview deployment of
[InferenceX-app](https://github.com/SemiAnalysisAI/InferenceX-app) with
Intel Gaudi 3 benchmark data. It is **not** intended to merge into upstream
`master` — it ships to a separate Vercel project pointed at a separate
Supabase Postgres so we can share Gaudi 3 curves with Intel without
disturbing production `inferencex.com`.

This `glm-4.7/` directory is the canonical example: source benchmark JSON,
how the model was served, how the load test was run, and how the data
landed in Supabase. **Follow the same pattern for GLM-5.1, DeepSeek-V4,
Kimi, MiniMax**, etc.

## What's in this directory

| File                                | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `guide.md`                          | vllm-gaudi container setup + first-pass benchmark notes      |
| `system-config.md`                  | Server, accelerator, driver, software-stack snapshot         |
| `running-inference.md`              | How to run the InferenceX `benchmark_serving.py` sweep       |
| `launch.sh`                         | Docker `run` command used to start vllm-gaudi                |
| `plot_results.py`                   | Local sanity plot (not used for the deployed UI)             |
| `results/glm47_conc{N}.json`        | Raw `benchmark_serving.py` output, one per concurrency level |
| `results/glm47_gaudi3_summary.json` | Hand-rolled summary used to populate `supplemental-bmk.json` |
| `plots/*.png`                       | Quick local plots for sanity-checking the curve              |

The actual rows that the dashboard reads from the DB live in
`packages/db/data/supplemental-bmk.json` — the `glm-4.7/` files are the
raw inputs and notes; the supplemental JSON is the curated form.

## End-to-end workflow

```
   ┌────────────────────────┐
1. │ Set up vllm-gaudi      │  → guide.md
   │ container + serve model│
   └────────────┬───────────┘
                │
   ┌────────────▼───────────┐
2. │ Run InferenceX         │  → running-inference.md
   │ benchmark_serving.py   │
   │ concurrency sweep      │
   └────────────┬───────────┘
                │
   ┌────────────▼───────────┐
3. │ Convert raw JSONs →    │  → see "Converting results" below
   │ supplemental-bmk.json  │
   └────────────┬───────────┘
                │
   ┌────────────▼───────────┐
4. │ Register model in code │  → see "Adding a new model" below
   │ (only if model is new) │
   └────────────┬───────────┘
                │
   ┌────────────▼───────────┐
5. │ Ingest into Supabase   │  → see "Ingesting" below
   └────────────┬───────────┘
                │
   ┌────────────▼───────────┐
6. │ Verify in local dev    │  → see "Verifying" below
   │ server, then push      │
   └────────────────────────┘
```

## 1 & 2. Run the benchmark

See **`guide.md`** for the vllm-gaudi container setup (Docker image,
`HABANA_VISIBLE_DEVICES`, `--tensor-parallel-size`, `pip install --upgrade
transformers`, etc.) and **`running-inference.md`** for the
`benchmark_serving.py` invocation. The default sweep is concurrency
1, 2, 4, 8, 16, 32, 64, 128 at ISL=1024 / OSL=1024 — keep that for
apples-to-apples comparison with the rest of the InferenceX dashboard
unless you have a reason to deviate.

Each run produces a JSON file like `glm47_conc1.json` in the
`benchmark_serving.py` output format. Copy them into a new directory
under this repo (e.g. `dsv4/results/`, `glm-5.1/results/`) so the raw
inputs stay traceable.

## 3. Converting results

The dashboard reads from `packages/db/data/supplemental-bmk.json`. Each
DB row needs one entry. Build it from the per-concurrency JSON output:

```jsonc
{
  "model": "<HF model path>", // e.g. "deepseek-ai/DeepSeek-V4-Pro"
  "hw": "gaudi3", // canonical GPU key
  "framework": "vllm-gaudi", // canonical framework key
  "precision": "bf16", // fp4 | fp8 | bf16 | int4
  "spec_decoding": "none", // "mtp" if MTP enabled
  "tp": 8, // tensor-parallel size
  "ep": 1, // expert-parallel size
  "conc": 1, // concurrency for this row
  "dp_attention": "false",
  "isl": 1024,
  "osl": 1024,
  "image": null, // container digest if you have it
  "date": "2026-MM-DD", // benchmark date
  "disagg": false,
  "is_multinode": false,
  "metrics": {
    "tput_per_gpu": 5.83, // total tokens/sec/GPU
    "output_tput_per_gpu": 2.32, // output tokens/sec/GPU
    "input_tput_per_gpu": 3.51,
    "mean_ttft": 0.16645, // SECONDS (NOT ms)
    "median_ttft": 0.16441,
    "p99_ttft": 0.2222,
    "std_ttft": 0.03778,
    "mean_tpot": 0.05369,
    "median_tpot": 0.05288,
    "p99_tpot": 0.05926,
    "std_tpot": 0.00243,
    "mean_itl": 0.05381,
    "median_itl": 0.05256,
    "p99_itl": 0.07109,
    "std_itl": 0.00435,
    "mean_intvty": 18.62, // tokens/sec  (= 1 / mean_tpot)
    "median_intvty": 18.91,
    "p99_intvty": 16.87,
  },
}
```

Critical conversions from `benchmark_serving.py` raw output:

| Raw field (ms)                      | Stored as             | Conversion                           |
| ----------------------------------- | --------------------- | ------------------------------------ |
| `mean_ttft_ms`                      | `mean_ttft`           | `value_ms / 1000`                    |
| `median_ttft_ms`                    | `median_ttft`         | `value_ms / 1000`                    |
| `p99_ttft_ms`                       | `p99_ttft`            | `value_ms / 1000`                    |
| `std_ttft_ms`                       | `std_ttft`            | `value_ms / 1000`                    |
| `mean_tpot_ms`                      | `mean_tpot`           | `value_ms / 1000`                    |
| `median_tpot_ms`                    | `median_tpot`         | `value_ms / 1000`                    |
| `p99_tpot_ms`                       | `p99_tpot`            | `value_ms / 1000`                    |
| `mean_itl_ms`                       | `mean_itl`            | `value_ms / 1000`                    |
| `p99_itl_ms`                        | `p99_itl`             | `value_ms / 1000`                    |
| (computed)                          | `mean_intvty`         | `1 / mean_tpot_seconds` (tokens/sec) |
| (computed)                          | `median_intvty`       | `1 / median_tpot_seconds`            |
| `output_throughput / num_gpus`      | `output_tput_per_gpu` | divide by `tp * ep`                  |
| `total_token_throughput / num_gpus` | `tput_per_gpu`        | divide by `tp * ep`                  |

**Units are seconds.** The DB convention is seconds across the board;
the UI multiplies back to ms for display.

A row per concurrency level → 8 rows per benchmark run.

## 4. Adding a new model

Most of the models we care about are already registered in upstream
`master`, so you only need to add code in two cases:

**Case A — model is new to the codebase (e.g. GLM-4.7):** add the
display name + DB key in:

- `packages/constants/src/models.ts` → `DB_MODEL_TO_DISPLAY`: `'glmX.Y': 'GLM-X.Y'`
- `packages/db/src/etl/normalizers.ts` → `MODEL_TO_KEY`: `'<hf-path>': 'glmX.Y'`
- `packages/app/src/lib/data-mappings.ts` → add to the `Model` enum and `MODEL_CONFIG`
  (use `category: 'experimental'` for preview data so it's clearly not promoted)

**Case B — model already exists (GLM-5, GLM-5.1, DSv4, Kimi K2.5,
MiniMax M2.5, etc):** no code edit needed — just append the rows to
`supplemental-bmk.json` with the existing DB key.

For Gaudi-specific framework or precision combos that aren't in the
registries yet, edits go in:

- `packages/constants/src/framework-aliases.ts` → `FW_REGISTRY`
- `packages/constants/src/precision-keys.ts` → `PRECISION_KEYS` (only if a new format)

The Gaudi 3 hardware key (`gaudi3`) and `vllm-gaudi` framework are
already registered on this branch — reuse them.

## 5. Ingesting

Get the Supabase Postgres URL into your local `.env` (one-time setup):

```bash
# .env at repo root  (gitignored — never commit)
DATABASE_WRITE_URL=postgresql://postgres.gtvtkgpwuhpsfiugezbe:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres
DATABASE_READONLY_URL=postgresql://postgres.gtvtkgpwuhpsfiugezbe:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres
DATABASE_DRIVER=postgres
DATABASE_SSL=true
```

Get `<PASSWORD>` from the Supabase dashboard:
**https://supabase.com/dashboard/project/gtvtkgpwuhpsfiugezbe/settings/database**
(reveal the existing one, or click "Reset database password"). The
preview project is on the FarmGPU Supabase org.

The pooler hostname (`aws-1-us-west-1.pooler.supabase.com`) is required
because the macOS dev machine can't reach Supabase's direct IPv6.
The pooler also works fine from Vercel, GitHub Actions, and Linux
machines that _do_ have IPv6 — just always use the pooler for consistency.

Then run the ingest:

```bash
pnpm install
pnpm admin:db:ingest:supplemental -y
```

This is idempotent — re-running it after appending new rows to
`supplemental-bmk.json` only inserts the new (unique) rows, thanks to
the `(workflow_run_id, config_id, isl, osl, conc)` unique constraint.

If the schema has drifted (e.g. you pulled upstream and there are new
migrations), run `pnpm admin:db:migrate` first.

## 6. Verifying

```bash
pnpm dev           # http://localhost:3000
```

Open `/inference`, set the date to your benchmark date (default is
"latest"), and pick the model from the picker. Models added with
`category: 'experimental'` show under the **Experimental** group.

Quick API sanity check without the UI:

```bash
curl -s "http://localhost:3000/api/v1/availability" | jq '.[] | select(.hardware == "gaudi3")'
curl -s "http://localhost:3000/api/v1/benchmarks?model=GLM-4.7&date=2026-03-14" | jq '.[0:2]'
```

Once the curve looks right locally, commit `supplemental-bmk.json`
(plus any registry edits and the raw `<model>/results/*.json` for
traceability), push to `gaudi3-preview` on the `farmgpu` remote, and
the Vercel preview will redeploy automatically.

## Reference

- **Supabase project:** `gtvtkgpwuhpsfiugezbe` (FarmGPU org, us-west-1)
  Dashboard: <https://supabase.com/dashboard/project/gtvtkgpwuhpsfiugezbe>
- **GitHub fork:** <https://github.com/FarmGPU/InferenceX-app>
- **Production branch on the fork:** `gaudi3-preview` (NOT `master`)
- **Vercel project:** see Vercel dashboard under FarmGPU team
- **Schema:** `packages/db/migrations/001_initial_schema.sql`
- **Ingest source:** `packages/db/src/ingest-supplemental.ts`
- **Benchmark mapper (canonical metric keys):** `packages/db/src/etl/benchmark-mapper.ts`
- **Metric key list:** `packages/constants/src/metric-keys.ts`

## Common gotchas

- **Latency in seconds, not ms.** `benchmark_serving.py` reports `_ms`;
  divide by 1000 before storing.
- **Per-GPU throughput, not aggregate.** Divide by total GPU count
  (`tp * ep` for non-disagg).
- **Date is the benchmark run date** (`YYYY-MM-DD`), not today's date.
  Each unique date in `supplemental-bmk.json` becomes its own
  `workflow_runs` row.
- **`hw: "gaudi3"`** — lowercase canonical key. The DB enforces lowercase.
- **`framework: "vllm-gaudi"`** — must match the `FW_REGISTRY` entry exactly.
- **Don't commit `.env`** — it's gitignored, but double-check
  `git status` doesn't list it before pushing.
- **The pooler URL uses `postgres.<projectref>` as username**, not just
  `postgres`. Easy to miss when copy-pasting from the dashboard's
  "Direct connection" tab; use the "Session pooler" tab instead.
