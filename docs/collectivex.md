# CollectiveX

Design rationale for the CollectiveX tab's data pipeline. Unlike every other tab
(Neon DB → ETL ingest → `/api/v1/*`), CollectiveX uses **lazy ingest-on-read**: its
database is a durable cache of GitHub Actions, populated by the API routes themselves.

## Why lazy ingest instead of the main pipeline

- **Sweep artifacts expire after 14 days.** The sweep workflow
  (`collectivex-sweep.yml` in the harness repo) uploads a matrix artifact
  (`cxsweep-matrix-{run_id}`) and per-cell result artifacts
  (`cxshard-{cell}-{run_id}-{attempt}`) with 14-day retention. Persisting on first
  view makes a run outlive its artifacts once anyone has looked at it.
- **The sweep JSON contract is expected to change.** The DB stores the RAW documents
  verbatim; the shared reader (`packages/db/src/collectivex/reader.ts`) is the single
  transform point and runs at API-read time, so a reader fix retroactively applies to
  already-stored runs — no re-ingest. A contract change = reader change + a bump of the
  numeric `version` in the harness's `experimental/CollectiveX/configs/sweep.json`.
- **No CI plumbing.** There is no ingest workflow, no cross-repo dispatch, and no GH
  secrets. Runs launched via `gh api` on any harness branch appear on the dashboard
  within the CDN TTL of someone viewing the page — only the workflow identity is
  checked, never the branch.

## How it works

`packages/app/src/lib/collectivex-lazy-ingest.ts` exposes three `ensure*` functions the
routes call before reading the DB (`packages/db/src/queries/collectivex.ts`):

- `ensureLatestCollectiveXRun` — walk GitHub's completed sweep runs newest-first; stop at
  the first live requested-version run; persist it if absent.
- `ensureCollectiveXRunsList` — progressively backfill every requested-version run whose
  14-day artifacts may still be downloaded. Each request changes at most eight rows; an
  incomplete response is uncached and the client refetches until the workflow history is
  exhausted. Known rows do not consume the batch, so discovery advances past the newest runs.
  GitHub discovery is limited to runs created within the last 44 days: the 30-day workflow
  rerun window plus 14-day artifact retention, covering the oldest rerun whose artifacts can
  still exist without rescanning permanent workflow history on every cold-origin request.
- `ensureCollectiveXRun` — fetch one run by id, or compare a stored run's `run_attempt`
  against GitHub and refresh it when a rerun is newer. Only completed runs are persisted.

Key invariants:

- **Writes are atomic and race-safe**: one CTE statement with
  `ON CONFLICT (run_id) DO NOTHING`; concurrent first-viewers can't double-ingest or
  expose a partial run. A GitHub re-run (newer `run_attempt`) is replaced through a
  `FOR UPDATE`-guarded refresh statement.
- **Deletion tombstones** (`cx_runs.deleted_at`, documents freed): discovery must never
  resurrect a deleted run. Re-ingesting via the CLI
  (`bun run admin:db:ingest:collectivex <run-url-or-id>`) clears the tombstone — that CLI is
  the operator tool for pre-warming runs before artifact expiry, backfills, and un-deletes.
- **"Latest" orders by `run_id`** (monotonic with run creation, matching the discovery
  walk) — not by completion time, where a long-failing older run would shadow a newer
  successful one.
- **Vendor scope is explicit**: the shared reader accepts only `amd` and `nvidia`
  result shards (case-insensitive). Other vendor values are omitted from chart series,
  coverage, and SKU summaries; runs with no supported-vendor cases stay hidden.
- **GitHub being down never takes the page down**: routes serve whatever the DB holds and
  only surface an error when there is no stored fallback.
- **Run-list completeness is progressive**: `/api/v1/collectivex/runs` returns
  `discovery_complete: false` while another bounded ingest pass is required. Those responses
  use `private, no-store`; the client polls once per second until the field becomes `true`.
  Stored runs remain visible indefinitely, while never-ingested runs disappear with their
  upstream artifacts and can no longer be reconstructed.
- **Caching**: responses carry the `collectivex` CDN tag with a 60s
  `s-maxage` (freshness bound for lazy discovery). Run deletion and
  `POST /api/v1/invalidate?scope=collectivex` purge only that tag; the main dashboard's
  blob cache is untouched by CollectiveX operations.
- **Env**: `DATABASE_COLLECTIVEX_READONLY_URL` (must be the same primary as the write URL
  — the routes read their own writes), `DATABASE_COLLECTIVEX_WRITE_URL` (direct/unpooled;
  also used by migrations via `bun run admin:db:migrate:collectivex`),
  `COLLECTIVEX_ADMIN_SECRET` (delete route Bearer token — deliberately not
  INVALIDATE_SECRET, since it is remembered in browser localStorage), and `GITHUB_TOKEN`.

## Multi-run explorer

The frontend loads every stored live run summary for the selected benchmark version and keeps
refetching while recent GitHub history is still being ingested. The summary query has no arbitrary
row cap and does not load artifact documents. Each table row has a visibility checkbox; checking a
run fetches its cached dataset through `/api/v1/collectivex/runs/[runId]`. Checked datasets are
combined client-side, and the EP, phase, kernel mode, precision, SKU, and backend controls filter
their combined series.

Series ids are namespaced by GitHub Actions run id so the same matrix case from two runs remains
independently toggleable. Configuration color stays consistent across runs; run identity is encoded
by the active selection order: the first checked run is solid and each additional checked run gets
the next non-repeating dash pattern. Removing a run compacts those style slots, so a lone remaining
run is always solid. Active patterns appear in both the run table and legend, keeping run ids out of
visible legend labels while retaining them in the legend item's accessible title.
The newest run with measured cases is checked by default; newer incomplete sweeps remain listed but
cannot blank the initial explorer. Deletion is available per row or as one confirmed action for all
currently shown runs; both paths keep the same tombstone semantics described above.

## The raw-rows exception

CollectiveX routes return the **assembled** dataset (reader over stored matrix + docs)
instead of raw rows. The reader is shared between the app and the CLI through the db
package (`@semianalysisai/inferencex-db/collectivex/*`), so ingest-time validation and
read-time assembly can never drift; shipping raw docs to the client would only move the
same shared transform across the wire.
