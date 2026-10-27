# CollectiveX

Design rationale for the CollectiveX tab's data pipeline. CollectiveX keeps its own Neon
database, filled from the benchmark results that `SemiAnalysisAI/InferenceX` commits under
`collectivex/results/`: `cases.json` (the requested cases, with the contract `version`) plus
one `<sku>/<case_id>.json` per measured case. The API routes only read that database.

## One run per results commit

Each InferenceX commit on `main` that changed `collectivex/results/` is one stored run:

- `run_id` is the commit's committer time in epoch seconds. It grows with `main`'s history,
  so "latest" still means `ORDER BY run_id DESC`. Two results commits landing in the same
  second would collide; the ingest refuses the second one (HTTP 409 / CLI error) rather than
  overwrite it.
- `run_attempt` is always 1, `source_sha` is the results commit, `source_branch` is `main`,
  `conclusion` is `success`, `matrix` is `cases.json` and `summary` is the shared reader's
  `buildRunSummary`. `cx_run_docs` holds the commit's result documents verbatim.
- Re-ingesting a commit is idempotent: one statement upserts the row and replaces its
  documents, so a reader sees the old contents or the new ones, never a mix.
- A ref resolves to the newest results commit at or before it, and that commit must be in
  `main`'s results history. Ingesting `main` after an unrelated merge therefore refreshes
  the run already published for those files instead of creating a duplicate, and results
  that never landed on `main` are never published.

The DB stores raw documents; the shared reader (`packages/db/src/collectivex/reader.ts`)
assembles the dataset at read time, so a reader fix applies to stored runs without
re-ingesting. A contract change is a reader change plus a bump of the numeric `version` that
`cases.json` and every EP result carry.

## Ingest

`packages/db/src/collectivex/committed-results.ts` is shared by both entry points. It reads
exactly `collectivex/results/**` at the pinned commit: the git trees API lists the files and
each blob comes from `raw.githubusercontent.com`, which does not count against the REST rate
limit. It then checks every file the way the benchmark repo's own test does: the path is
`<sku>/<case_id>.json` matching the document's identity (EP case attempts by
`identity.case_id` and `identity.case_factors.sku`; swap_blocks results by
`schema: collectivex-swap-blocks-v1`, `case_id` and `runtime.sku`), the case is runnable in
`cases.json`, the result was measured from committed code (`source_dirty: false`), and an EP
result carries the `cases.json` version. Each document is then assembled alone, so every
failure names its file. Files above 4 MiB, or a tree above 256 MiB, are rejected.

- **Workflow**: `.github/workflows/ingest-collectivex.yml` runs on `repository_dispatch`
  type `ingest-collectivex` with `client_payload: {"sha": "<40 hex>"}`, which the InferenceX
  workflow sends on pushes to `main` that touch `collectivex/results/`, and on
  `workflow_dispatch` with exactly one of `sha` (40 hex), `ref`, or `backfill`. It runs
  `migrate-collectivex.ts --yes`, then the ingest CLI with `--sha`, `--ref` or `--backfill`
  and `--yes` against the `DATABASE_COLLECTIVEX_WRITE_URL` secret (GitHub reads use
  `INFX_MAIN_PAT`), then purges the cache with `POST /api/v1/invalidate?scope=collectivex`
  (`VERCEL_INVALIDATE_SECRET`). It alerts Slack on failure, like `ingest-operatorx`.
- **CLI**: `bun run admin:db:ingest:collectivex [--sha <sha> | --ref <ref>] [--backfill]
[--yes] [--no-ssl]` ingests one commit (default: `main`), or with `--backfill` every
  results commit on `main`, oldest first, reusing unchanged files between commits. It asks
  for confirmation unless `--yes` is given and stops at the first failing commit.
  `GITHUB_TOKEN` is optional but raises GitHub's API rate limit.

## Operator runbook: re-seed from committed results

Run these against the CollectiveX database only, in order:

1. **Archive** the current contents:
   `pg_dump --table=cx_runs --table=cx_run_docs "$DATABASE_COLLECTIVEX_WRITE_URL" > cx-archive.sql`
2. **Wipe**: `psql "$DATABASE_COLLECTIVEX_WRITE_URL" -c 'TRUNCATE cx_run_docs, cx_runs'`.
   Until the backfill finishes, `/api/v1/collectivex/latest` returns 404 and the run list is empty.
3. **Migrate**: `bun run admin:db:migrate:collectivex` (applies `004_committed_results.sql`,
   which drops the unused `deleted_at` tombstone column).
4. **Backfill**: run the `Ingest CollectiveX Results` workflow with `backfill` checked, which
   also purges the cache. Locally, `bun run admin:db:ingest:collectivex --backfill`, then
   `POST /api/v1/invalidate?scope=collectivex` (the CLI does not reach the CDN).

## Serving

- **Reads use the primary**: every route reads through `DATABASE_COLLECTIVEX_WRITE_URL`, so a
  response cached right after an ingest's purge never comes from a lagging replica.
  `DATABASE_COLLECTIVEX_READONLY_URL` is not read by the app routes.
- **Caching**: responses carry the `collectivex` CDN tag with the default one-day `s-maxage`.
  The ingest workflow purges only that tag through `POST /api/v1/invalidate?scope=collectivex`; the
  main dashboard's blob cache is untouched by CollectiveX operations.
- **Partial results**: a commit may hold results for only some pools (the first committed
  results cover only `mi300x` and `mi325x`). Every runnable case in `cases.json` without a
  result file stays in `coverage` with outcome `pending` (requested, not run), counts toward
  `requested_cases` but not `measured_cases`, and adds no series, so the SKU controls list
  only measured pools. A later commit that adds pools is a new run with a later `run_id`,
  so it becomes the latest run while the earlier one stays listed.
- **Run list**: `/api/v1/collectivex/runs` always reports `discovery_complete: true`; the
  field stays for existing clients.
- **No deletion or ingest in the app**: the app exposes no CollectiveX mutation. Runs are
  added by the ingest workflow or CLI and removed by changing the committed results.
- **Vendor scope is explicit**: the shared reader accepts only `amd` and `nvidia` results
  (case-insensitive). Other vendor values are omitted from chart series, coverage, and SKU
  summaries; runs with no supported-vendor cases stay hidden.
- **Withheld tails**: an EP result may publish p90/p95/p99 as `null` when too many of a
  series' samples were misaligned or host-stalled (p50 is always present). The reader keeps
  the derived rates `null` there, the alpha-beta fit skips them, and the tooltip shows them
  as unavailable.
- **Links**: a run links to `collectivex/results/` and the methodology at its `source_sha`.

## Known-support matrix

The bottom of the page carries the curated known-support matrix: every SKU × library pairing for
throughput (`normal`) and `low-latency` kernels at EP8 and EP16, independent of which runs are
checked. Green degrees are known to work on the fleet; red degrees are known NOT to work, each
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
The run-table suite filter includes swap_blocks; checked runs share the normal comparison
selection and run dash styles. The chart selects direction, layout and latency percentile,
plots block bytes in B/KiB/MiB/GiB, and keeps bandwidth linear with a zero baseline.
Latency is logarithmic. Bandwidth is copied payload divided by host-observed latency,
including submission and CUDA synchronization, counting payload once even for d2d.
Both `/collectivex` and `/zh/collectivex` expose the controls and tooltips.

Bandwidth charts draw dashed nominal hardware rooflines for visible GPUs, including across
checked comparison runs. Host transfers use **64 GB/s one-way PCIe 5.0 x16** on the
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
