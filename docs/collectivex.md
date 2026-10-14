# CollectiveX

Design rationale for the CollectiveX tab's data pipeline. Unlike every other tab
(Neon DB → ETL ingest → `/api/v1/*`), CollectiveX has **no database**: each build
assembles a static snapshot from the result files committed to the benchmark repo,
and the API routes serve that snapshot.

## Why a build-time snapshot

- **Results are committed, not uploaded.** CollectiveX runs by hand on each pool's
  login node (`collectivex/run.sh <sku>` in SemiAnalysisAI/InferenceX). Each run writes
  `collectivex/results/<sku>/<case_id>.json`; committing those files to `main` is the
  publish step. The benchmark repo's `collectivex/tests/test_results.py` checks every
  committed result: a current runnable case, clean source, no host identifiers.
- **Git is the durable store.** Results never expire and every published number has
  a commit. The previous design ingested GitHub Actions artifacts lazily into a
  separate Neon database because artifacts expired after 14 days; that cache,
  its tombstoned deletes, and its admin delete route are gone.
- **The reader stays the single transform.** `packages/db/src/collectivex/reader.ts`
  assembles the dataset from raw result documents, now once per build. A reader fix
  applies on the next deployment. A contract change = reader change + a bump of the
  numeric `version` that `cases.json` and every EP result document carry.

## How it works

`packages/app/scripts/sync-collectivex.ts` runs before `next build` (`bun run build`)
and, with `--if-missing`, before `next dev`:

1. Pin InferenceX `main` (or `COLLECTIVEX_RESULTS_REF`) to a commit. With `GITHUB_TOKEN`
   it asks the commits API; without one it reads the commit id that `git archive` embeds
   in the tarball.
2. Download `https://codeload.github.com/SemiAnalysisAI/InferenceX/tar.gz/<sha>` and
   keep only `collectivex/results/**`.
3. Validate, assemble with the shared reader, and write
   `packages/app/.collectivex/snapshot.json` (`{ summary, dataset }`, gitignored).

`next.config.ts` bundles the file with the CollectiveX routes through
`outputFileTracingIncludes`; `src/lib/collectivex/snapshot.ts` (`server-only`) reads it
once per server instance. Nothing polls InferenceX: a result committed to `main`
appears with the next app deployment.

Validation fails the build — the script exits non-zero — on any of:

- a fetch failure, or a missing `collectivex/results/cases.json`;
- a `.json` file that is not at `<sku>/<case_id>.json`, or whose folder and file name
  do not match the document's SKU (`identity.case_factors.sku`, swap
  `runtime.sku`) and `case_id`;
- a result that is not a runnable case in `cases.json`, or was measured with
  uncommitted `collectivex/` edits (`source_dirty` not `false`);
- a missing `generated_at`, or anything the reader rejects (for example an EP
  document whose `version` differs from `cases.json`). Each document is checked alone
  first, so the error names its file.

Other flags: `--ref <git ref>` reads another branch, tag, or commit;
`--from <InferenceX checkout>` reads a local clone's committed objects (`HEAD`, or
`--ref`) instead of GitHub. Without `--ref`, `COLLECTIVEX_RESULTS_REF` selects the ref,
so a preview deployment can build from a results branch; production leaves it unset
and reads `main`, failing the build while `main` has no `cases.json`.
`bun run --cwd packages/app sync:collectivex -- --ref <branch>` refreshes a development
snapshot. `E2E_FIXTURES=1` skips the sync: fixture mode serves
`cypress/fixtures/api/collectivex-latest.json` as the snapshot.

### The snapshot run

A snapshot is one synthetic run, so the existing response shapes (and skills 1.1.0)
keep working:

- `run_id`: the newest result `generated_at` in epoch seconds (the commit time when
  there are no results yet), so a later snapshot always has a larger id;
- `run_attempt` 1, `conclusion` `success`, `generated_at` that time as
  `YYYY-MM-DDTHH:MM:SSZ`, and `source_sha` the InferenceX commit the results came from.

Coverage comes from `cases.json`: a requested case without a result file is pending,
so an empty results folder is still a valid snapshot.

## Routes

- `latest?version=1` returns the snapshot dataset.
- `runs?version=1` returns `{ version, runs: [summary], discovery_complete: true }`.
- `runs/[runId]?version=1` returns the dataset when `runId` is the snapshot's run id,
  else 404.
- A version the snapshot does not carry is 404 (`latest`, `runs/[runId]`) or an empty
  list (`runs`). A deployment without a snapshot answers 503; an unreadable snapshot 500.
- Responses use the shared one-day CDN policy of `cachedJson`. The data only changes
  with a deployment, so the routes need neither a separate cache tag nor an
  invalidation scope. They stay dynamic because they validate `?version=` and the
  view route applies filters.

**Vendor scope is explicit**: the shared reader accepts only `amd` and `nvidia` EP
result documents (case-insensitive). Other vendor values are omitted from chart series,
coverage, and SKU summaries.

## Multi-run explorer

The frontend lists the run summaries for the selected benchmark version — one run per
deployment — and fetches a checked run's dataset through `/api/v1/collectivex/runs/[runId]`.
Checked datasets are combined client-side, and the EP, phase, kernel mode, precision,
SKU, and backend controls filter their combined series. Shift-clicking a checkbox
applies its new state to every row between it and the previously clicked row, in the
table's current (suite-filtered) order. A loaded run links to its committed results
(`tree/<source_sha>/collectivex/results`).

Series ids are namespaced by run id so the same matrix case from two runs remains
independently toggleable. Configuration color stays consistent across runs; run identity is encoded
by the active selection order: the first checked run is solid and each additional checked run gets
the next non-repeating dash pattern. Removing a run compacts those style slots, so a lone remaining
run is always solid. Active patterns appear in both the run table and legend, keeping run ids out of
visible legend labels while retaining them in the legend item's accessible title.
The newest run with measured cases is checked by default.
The Runs card's suite filter narrows the table to runs containing EP or KV cases; a run containing
both appears under both filters, and changing the filter does not alter the checked-run selection.
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

CollectiveX routes return the **assembled** dataset (reader over `cases.json` plus result
documents) instead of raw rows. The reader lives in the db package
(`@semianalysisai/inferencex-db/collectivex/*`) and is shared by the sync script, tests,
and the fixtures, so validation and assembly can never drift; shipping raw documents to
the client would only move the same shared transform across the wire.

## vLLM swap_blocks

**English** | [中文](./collectivex-swap-blocks_zh.md)

`cases.json` requests swap_blocks cases with `suite: "swap-blocks"`, one per GPU pool and
layout; they have no EP token ladder and never enter EP coverage. Their results are
`collectivex-swap-blocks-v1` documents carrying `case_id`, `profile`, `generated_at`, and
`runtime.sku`. The shared reader accepts a document only when it answers exactly one
requested swap_blocks case of its own GPU pool, and validates correctness, payload
arithmetic, finite positive ordered latency percentiles, sample counts, and runtime
provenance (`runtime.source_sha` is the measuring commit and may predate the snapshot
commit). EP/KV documents keep their existing reader path.

The additive `swap_blocks` dataset field holds runtime provenance and measured points;
`swap_cases` counts requested and measured swap_blocks cases separately from EP/KV. One
verified document counts as one measured case; a requested case without one stays
pending. Each measured (direction, layout, block bytes, block count, seed) is one point.
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

Measurement identity includes SKU so equivalent grid points from different GPU pools
remain independent.
