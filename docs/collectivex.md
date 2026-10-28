# CollectiveX

Design rationale for the CollectiveX tab's data pipeline. CollectiveX keeps its own Neon
database, filled by uploading the benchmark results that `collectivex/run.sh` writes on a
cluster: a `results/` directory holding `cases.json` (the requested cases, with the contract
`version`) plus one `<sku>/<case_id>.json` per measured case. The results are not stored in
`SemiAnalysisAI/InferenceX` or any other git repository; the database is their only store.
The API routes only read that database.

## One run per upload

Each upload is one new stored run: the latest stored run of the same `version` with the
uploaded files laid over it, keyed by `(sku, case_id)`.

- An uploaded file replaces that case's stored document; every other stored document is kept.
- The upload's `cases.json` is the new run's matrix. A stored document that is not runnable in
  it, or whose `version` differs, is dropped, and the plan names each dropped `sku/case_id`.
  A case the new `cases.json` still requests but nobody has measured yet stays `pending`.
- The merged set is validated as a whole before anything is written (below), so a kept
  stored document that no longer passes the checks stops the upload.
- When nothing is stored yet, the run is just the upload.
- A run with nothing measured is refused, never stored as an empty run, and the read
  queries hide any row whose summary measures nothing.

The stored row:

- `run_id` is the upload time in epoch seconds, raised to one past the highest `run_id`
  stored in any version when it would not exceed it (a clock behind the newest run, or two
  uploads in one second), so "latest" is still `ORDER BY run_id DESC`. Ids stay below 10^10,
  which migration `005_remove_lazy_ingest_runs.sql` enforces with a CHECK after deleting the
  retired lazy ingest's rows (keyed by GitHub Actions run id, so they would otherwise outrank
  every later run); the bound is `RUN_ID_LIMIT` in `results-upload.ts`.
- `source_sha` is the one `collectivex/` commit every uploaded document was measured from
  (`provenance.source_sha` on EP results, `runtime.source_sha` on swap_blocks results). An
  upload whose documents name different commits is refused with the files of each sha
  listed; upload them separately. Kept stored documents keep their own `source_sha`.
- `run_attempt` is 1, `source_branch` is null, `conclusion` is `success`, `generated_at` is
  the upload time (UTC, whole seconds), `matrix` is the uploaded `cases.json` and `summary`
  is the shared reader's `buildRunSummary`. `cx_run_docs` holds the merged documents
  verbatim.
- One transaction takes a fixed advisory lock (`pg_advisory_xact_lock`, shared by every
  CollectiveX write) and then one statement inserts the row and its documents, so a reader
  sees the old latest run or the new one, never a mix. Under the lock the write first checks
  that the highest stored `run_id` is still the one the upload merged against; if another
  run landed in between, nothing is written and the CLI asks for a rerun, so two concurrent
  uploads cannot drop each other's cases.

The DB stores raw documents; the shared reader (`packages/db/src/collectivex/reader.ts`)
assembles the dataset at read time, so a reader fix applies to stored runs without
re-ingesting. A contract change is a reader change plus a bump of the numeric `version` that
`cases.json` and every EP result carry.

## Ingest

`packages/db/src/collectivex/results-upload.ts` reads the directory: `cases.json` and every
`*.json` exactly one level down (`<sku>/<file>.json`). Other files, dot entries such as
`.shards`, and deeper directories are ignored; a symlink anywhere on that path is rejected.
Files above 4 MiB, or results above 256 MiB in total, are rejected. It then checks every
file the way the benchmark repo's own test does: the path is `<sku>/<case_id>.json` matching
the document's identity (EP case attempts by `identity.case_id` and
`identity.case_factors.sku`; swap_blocks results by `schema: collectivex-swap-blocks-v1`,
`case_id` and `runtime.sku`), the case is runnable in `cases.json`, the result was measured
from committed code (`source_dirty: false` and a 40-hex `source_sha`), an EP result carries
exactly the `cases.json` version, and no string holds an IPv4 address and no key names a
machine (`host`, `hosts`, `hostname`, `nodelist`, `slurm_nodelist`, `master_addr`,
case-insensitive). Each document is then assembled alone, so every failure names its file.

- **CLI**: `bun run admin:db:ingest:collectivex (--dir <results-dir> | --delete-run <run_id>)
[--yes] [--no-ssl]`. `--dir` reads and validates the directory, merges it over the latest
  stored run, prints the plan (run_id, source sha, how many uploaded, replaced, kept and
  dropped, each dropped case) and asks for confirmation unless `--yes` is given. It writes
  through `DATABASE_COLLECTIVEX_WRITE_URL` and never prints that URL. `--delete-run` deletes
  one stored run and its documents. After a write, when `APP_URL` and
  `VERCEL_INVALIDATE_SECRET` are set, it purges the cache with
  `POST ${APP_URL}/api/v1/invalidate?scope=collectivex` (Bearer auth, plus
  `x-vercel-protection-bypass` when `VERCEL_PROTECTION_BYPASS_SECRET` is set); otherwise it
  says the dashboard updates when its cache expires or after the workflow below runs.
- **Workflow**: `.github/workflows/ingest-collectivex.yml` (`Ingest CollectiveX Results`) runs
  only on `workflow_dispatch`. With no input it applies pending migrations
  (`migrate-collectivex.ts --yes`) and purges the CollectiveX cache, for example after an
  upload made without the purge variables. With `delete_run` it also deletes that run before
  purging. Every run shares one concurrency group that queues rather than cancels, and it
  alerts Slack on failure, like `ingest-operatorx`. It reads no GitHub repository.

There is no backfill and no prune: the results exist only in the database, so nothing can
rebuild a deleted run.

## Operator runbook

**Upload results** from a cluster checkout after `collectivex/run.sh` finishes:

1. Apply migrations once per schema change: `bun run admin:db:migrate:collectivex` (or run
   the workflow with no input).
2. `bun run admin:db:ingest:collectivex --dir <path/to/collectivex/results>`, read the plan,
   and confirm. Upload one `source_sha` at a time.
3. If the CLI could not purge the cache, run the `Ingest CollectiveX Results` workflow with no
   input.

**Retract a bad run** at once with `--delete-run <run_id>` (or the workflow's `delete_run`).
The previous run becomes the latest again, and the next upload merges over it. To fix one
case instead, upload its corrected result: the new run replaces that case and keeps the rest.

**Archive** before destructive maintenance, because the database is the only copy:
`pg_dump --table=cx_runs --table=cx_run_docs "$DATABASE_COLLECTIVEX_WRITE_URL" > cx-archive.sql`

## Serving

- **Reads use the primary**: every route reads through `DATABASE_COLLECTIVEX_WRITE_URL`, so a
  response cached right after an upload's purge never comes from a lagging replica.
  `DATABASE_COLLECTIVEX_READONLY_URL` is not read by the app routes.
- **Caching**: responses carry the `collectivex` CDN tag with the default one-day `s-maxage`.
  The ingest CLI and workflow purge only that tag through `POST /api/v1/invalidate?scope=collectivex`; the
  main dashboard's blob cache is untouched by CollectiveX operations.
- **Partial results**: a run may hold results for only some pools (for example a first
  upload covering only `mi300x` and `mi325x`). Every runnable case in `cases.json` without a
  result stays in `coverage` with outcome `pending` (requested, not run), counts toward
  `requested_cases` but not `measured_cases`, and adds no series, so the SKU controls list
  only measured pools. A later upload of other pools is a new run with a later `run_id` that
  also keeps the earlier pools' results, so it becomes the latest run (a superset) while the
  earlier one stays listed in the API.
- **One run on the page**: `/collectivex` shows only the newest stored run with at least one
  measured case; there is no run table or multi-run overlay. The header's Suites control picks
  the one section shown: `EP` (the default) shows the EP chart controls and chart, `KV` the
  kv-transfer section, and `swap_blocks` the swap_blocks section. KV and swap_blocks are offered
  only when the shown run carries them, and a run without EP series opens on its first suite.
- **Run list**: `/api/v1/collectivex/runs` always reports `discovery_complete: true`; the
  field stays for existing clients.
- **No deletion or ingest in the app**: the app exposes no CollectiveX mutation. Runs are
  added by the ingest CLI and removed with `--delete-run` or the workflow's `delete_run`
  (see the runbook).
- **Covered pools**: a run summary's `covered_skus` lists only pools with at least one
  measured result (EP, KV or swap_blocks); pools that are requested but have no result yet
  are not listed.
- **Vendor scope is explicit**: the shared reader accepts only `amd` and `nvidia` results
  (case-insensitive). Other vendor values are omitted from chart series, coverage, and SKU
  summaries; runs with no supported-vendor cases stay hidden.
- **Withheld tails**: an EP result may publish p90/p95/p99 as `null` when too many of a
  series' samples were misaligned or host-stalled (p50 is always present). The reader keeps
  the derived rates `null` there, the alpha-beta fit skips them, and the tooltip shows them
  as unavailable. This is an API response-shape change: in `series[].points[]`,
  `components.*.latency_us`, `components.*.activation_data_rate_gbps_at_latency_percentile`,
  `components.*.payload_data_rate_gbps_at_latency_percentile` and
  `roundtrip_token_rate_at_latency_percentile` may now carry `null` for `p90`, `p95` and
  `p99`; the API documentation says so.
- **Links**: a run links to the `collectivex/` code and the methodology at its `source_sha`;
  the results themselves are not in the repository.

## Known-support matrix

The bottom of the page carries the curated known-support matrix: every SKU × library pairing for
throughput (`normal`) and `low-latency` kernels at EP8 and EP16, independent of the shown run
and suite. Green degrees are known to work on the fleet; red degrees are known NOT to work, each
carrying a numbered note with the investigated reason (upstream issue references included, e.g.
ROCm/mori#610); gray degrees do not exist for that pairing (vendor-mismatched library, a kernel
with no such mode, or a pool the library was never brought up on). The table is maintained by hand
in `known-support.ts`, mirroring the InferenceX repo's `platform_config.json` registry plus its
wall investigations — when a registry row flips or a wall falls upstream, the cell and its note
change here.

## The raw-rows exception

CollectiveX routes return the **assembled** dataset (reader over stored matrix + docs)
instead of raw rows. The reader is shared between the app and the CLI through the db
package (`@semianalysisai/inferencex-db/collectivex/*`), so ingest-time validation and
read-time assembly can never drift; shipping raw docs to the client would only move the
same shared transform across the wire.

## vLLM swap_blocks

swap_blocks cases are requested in `cases.json` with `suite: "swap-blocks"` and answered by
`collectivex-swap-blocks-v1` documents at `<sku>/<case_id>.json`. Each result must answer
exactly one requested swap_blocks case of its own GPU pool; requested swap_blocks counts come
from `cases.json`, and those cases never enter the EP ladder parser. The shared reader
validates correctness, payload arithmetic, finite positive ordered latency percentiles and
sample counts. EP/KV documents keep their existing reader path. No database migration is
needed: raw JSON documents remain the source of truth.

The additive `swap_blocks` dataset field holds runtime provenance and measured points;
`swap_cases` labels their run summaries separately from EP/KV. One verified artifact counts
as one case; each measured (direction, layout, block bytes, block count, seed) is one point.
Budget-excluded combinations are reported separately and are never plotted as measurements.
The swap_blocks section appears when that suite is chosen in the Suites control, and the
methodology link then points at `swap-blocks.md`. The chart selects direction, layout and latency percentile,
plots block bytes in B/KiB/MiB/GiB, and keeps bandwidth linear with a zero baseline.
Latency is logarithmic. Bandwidth is copied payload divided by host-observed latency,
including submission and CUDA synchronization, counting payload once even for d2d.
Both `/collectivex` and `/zh/collectivex` expose the controls and tooltips.

Bandwidth charts draw dashed nominal hardware rooflines for visible GPUs. Host transfers use **64 GB/s one-way PCIe 5.0 x16** on the
registered x86 pools (including HGX B300's CPU uplink). GB200/GB300 use **225 GB/s per GPU
per direction**: the 900 GB/s bidirectional Grace C2C link is split across two GPUs.
Same-GPU copies use half the GPU Specs HBM bandwidth because each payload byte is read
and written. These are hardware references, not measured limits: warm-cache copies may
exceed the HBM reference; host memory, placement and protocol overhead reduce host rates.
Unknown SKUs get no assumed roofline. Rooflines disappear in latency mode or when all
matching series are hidden; bandwidth stays linear and includes the reference in its domain.

References: [H200 specifications](https://www.nvidia.com/en-us/data-center/h200/),
[AMD MI355X specifications](https://www.amd.com/en/products/accelerators/instinct/mi350/mi355x.html),
[Grace C2C ports per GPU](https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/measuring-performance.html#nvlink-c2c-maximum-transport-request-utilization),
[GB200 bidirectional C2C](https://developer.nvidia.com/blog/nvidia-gb200-nvl72-delivers-trillion-parameter-llm-training-and-real-time-inference/),
[HGX CPU uplink topology](https://docs.nvidia.com/enterprise-reference-architectures/whitepaper/hgx-servers-and-spectrum-x.pdf).

Every swap_blocks result carries `runtime.sku`, which must match its requested case.
Measurement identity includes SKU so equivalent grid points from different GPU pools remain
independent.
