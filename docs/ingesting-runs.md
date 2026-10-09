# Manual Run Ingest

How to load a GitHub Actions benchmark run into a dashboard database by hand. CI already ingests `SemiAnalysisAI/InferenceX` sweeps through the ingest workflows. Use this guide for approved runs that need manual ingestion.

Every path below goes through the same ETL entry point, `packages/db/src/ingest-ci-run.ts`. It has two modes:

| Mode     | Invocation                                     | Reads artifacts from                     |
| -------- | ---------------------------------------------- | ---------------------------------------- |
| Download | `ingest-ci-run.ts --download <run-url> [repo]` | GitHub, into a temp directory it creates |
| CI       | `ingest-ci-run.ts` with `INGEST_*` env vars    | A directory you already populated        |

`bun run admin:db:ingest:run <run-url>` is download mode with the repo-root `.env` loaded. You need Bun, the GitHub CLI, `unzip`, and database credentials supplied through your approved credential channel. Never commit `.env` or paste tokens and database URLs into issues, PRs, or logs.

## Set up a clean checkout

Run ingest from current `origin/master`. Model and hardware mappings live in `packages/db/src/etl/normalizers.ts`, and a stale checkout can skip rows it cannot map.

```bash
cd InferenceX-app
git fetch origin
git worktree add --detach /tmp/ifx-app-ingest origin/master
cp .env /tmp/ifx-app-ingest/.env
cd /tmp/ifx-app-ingest
CYPRESS_INSTALL_BINARY=0 bun install --frozen-lockfile
```

## Pick the target database

The ingest writes to `DATABASE_WRITE_URL`. Inspect the host without printing credentials, and confirm that it belongs to the intended database:

```bash
bun --env-file=.env -e '
const value = process.env.DATABASE_WRITE_URL;
if (!value) throw new Error("DATABASE_WRITE_URL is required");
console.log(new URL(value).host);
'
```

Writing to the public database requires explicit publication approval for the run and its artifacts, including server logs and trace payloads. Do not ingest confidential or NDA-covered data into it. A successful ingest is not publication clearance.

Check that the schema is current. Compare `packages/db/migrations` with the applied entries in `schema_migrations`; if migrations are pending, review them and run `bun run admin:db:migrate` from the repo root after confirming the target.

## Inspect the run

Replace the example run ID with the approved GitHub Actions run ID. Keep `REPO` and `RUN` set in the same shell for the commands below.

```bash
REPO=SemiAnalysisAI/InferenceX
RUN=12345678901 # Placeholder: replace before running.
gh api "repos/$REPO/actions/runs/$RUN" \
  --jq '{display_title, conclusion, run_attempt, created_at, head_branch}'
gh api "repos/$REPO/actions/runs/$RUN/artifacts?per_page=100" --paginate \
  --jq '.artifacts[] | [.name, .size_in_bytes] | @tsv'
```

Things to check:

- **Run attempt:** CI mode needs it as `INGEST_RUN_ATTEMPT`. Download mode reads it from the API.
- **Framework and model:** Read them from the artifact names rather than assuming the requested framework produced the run.
- **Server-log size:** Multinode `multinode_server_logs_*` artifacts can be large. Choose the download path below accordingly.
- **Mappings:** Check `normalizers.ts` for the model prefix and hardware in the artifact names. Unmapped rows are skipped; `UNMAPPED_ENTITIES_OUTPUT=<path>` writes a report for review.
- **Artifact availability:** Confirm that the selected artifacts have not expired.

## Ingest

### GitHub authentication

The ingest requires `GITHUB_TOKEN`, and its artifact helpers use `gh`. Use credentials authorized to read the source repository. An exported token can override your stored GitHub CLI login, so verify access with the metadata command above using the credentials you intend to use.

If using your stored `gh` login instead of an existing environment token, the following sets both variables without printing the token. Do not run it with shell tracing enabled.

```bash
T="$(env -u GITHUB_TOKEN -u GH_TOKEN gh auth token)" &&
  export GITHUB_TOKEN="$T" GH_TOKEN="$T"
unset T
```

Re-run the metadata command after changing credentials. Stop if authentication fails.

### Option A: download mode

Use this when the server logs are small enough to download. It also attaches available server logs to benchmark points.

```bash
cd /tmp/ifx-app-ingest/packages/db
bun --env-file=../../.env src/ingest-ci-run.ts --download \
  "https://github.com/$REPO/actions/runs/$RUN"
```

Download mode cleans up its temporary directory when it finishes. To compare against raw artifacts afterward, download the benchmark artifacts separately into a directory you retain.

### Option B: skip server logs

Download mode fetches the server logs paired with each selected benchmark artifact. For large logs, download the other artifacts yourself, then ingest in CI mode. This uses the same latest-per-logical-name selection for non-log artifacts; it does not inspect retry success before selecting the latest artifact.

```bash
cd /tmp/ifx-app-ingest/packages/db
DEST="$(mktemp -d "/tmp/ifx-ingest-$RUN.XXXXXX")"
bun -e '
import { dedupeArtifactsByLogicalName, downloadArtifact, listRunArtifacts } from "./src/lib/github-artifacts";
const [repo, runId, dest] = process.argv.slice(1);
for (const a of dedupeArtifactsByLogicalName(listRunArtifacts(repo, runId)).values()) {
  if (a.name.startsWith("server_logs_") || a.name.startsWith("multinode_server_logs_")) continue;
  console.log(a.name);
  downloadArtifact(a, dest);
}
' "$REPO" "$RUN" "$DEST"
```

Stop if any download fails. Only after all downloads finish, fetch the attempt number and run ingest:

```bash
ATTEMPT="$(gh api "repos/$REPO/actions/runs/$RUN" --jq '.run_attempt')" &&
INGEST_RUN_ID="$RUN" INGEST_RUN_ATTEMPT="$ATTEMPT" INGEST_ARTIFACTS_PATH="$DEST" INGEST_REPO="$REPO" \
  bun --env-file=../../.env src/ingest-ci-run.ts
```

Skipping server logs preserves trace replay and server metrics only when the `agentic_*` artifacts contain the required AIPerf profile and metrics exports, including `server_metrics_export.json`. Legacy or incomplete direct artifacts may need the server-log tarball as a fallback. Inspect those artifacts before choosing this path, and verify the stored metrics afterward.

### Read the summary

An illustrative summary:

```text
Benchmarks: +7 new, 0 dup
Trace replay: 7 rows linked, 0 agentic point(s) missing sibling artifact
Eval results (agg): +6 new
Skipped: 1 rows
  failed run (0 successful): 1
```

- **`failed run (0 successful)`:** A selected artifact had no successful requests and was skipped. Confirm that the expected successful points were stored; this message alone does not prove a good retry was selected.
- **`auto-captured unexpected metric '<key>'`:** The value is stored in `metrics` JSONB. Review the key and add it to `METRIC_KEYS` when it should become a first-class metric.
- **`missing sibling artifact`:** A nonzero count means some agentic points have no matching trace-replay sibling. Check that the required `agentic_*` artifacts downloaded. A zero count alone does not establish that every server-metrics export is present.

## Apply overrides and refresh the cache

From `packages/db`, preview the applicable overrides before applying them:

```bash
bun --env-file=../../.env src/apply-overrides.ts --run-id "$RUN" --allow-unregistered-run
```

After reviewing the preview:

```bash
bun --env-file=../../.env src/apply-overrides.ts --run-id "$RUN" --allow-unregistered-run --yes
```

The ingest refreshes `latest_benchmarks` itself. The dashboard can keep serving cached responses until the cache is invalidated. From the repo root, choose the option for the approved target:

- **Public dashboard:** Dispatch the Cache Refresh workflow, which targets the public deployment.

  ```bash
  gh workflow run cache-refresh.yml --repo SemiAnalysisAI/InferenceX-app --ref master
  ```

- **Another deployment with `INVALIDATE_SECRET` available:** Use its deployment URL.

  ```bash
  bun run admin:cache:invalidate "https://your-deployment.example"
  ```

Do not dispatch the public cache workflow for an unrelated database or deployment.

## Verify

Ensure `DATABASE_READONLY_URL` points to the same database as the write connection. Compare stored rows with the source artifacts; this query lists each point with headline metrics and whether server-metrics JSON was attached.

```bash
cd /tmp/ifx-app-ingest/packages/db
bun --env-file=../../.env -e '
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_READONLY_URL);
console.table(await sql`
  select br.conc, c.model, c.hardware, c.framework, c.precision, c.disagg, wr.date,
         round((br.metrics->>$$tput_per_gpu$$)::numeric) tput_per_gpu,
         round((br.metrics->>$$mean_ttft$$)::numeric, 3) mean_ttft,
         atr.server_metrics_json_gz is not null server_metrics
  from benchmark_results br
  join workflow_runs wr on wr.id = br.workflow_run_id
  join configs c on c.id = br.config_id
  left join agentic_trace_replay atr on atr.id = br.trace_replay_id
  where wr.github_run_id = ${Number(process.argv[1])}
  order by br.conc`);' "$RUN"
```

For Option B, `DEST` already points to the retained artifacts. For Option A, set `DEST` to your separately downloaded artifact directory. For AgentX benchmark JSON in the following layout:

```bash
for f in "$DEST"/bmk_agentic_*/*.json; do
  jq -r '[.conc, .num_requests_successful, (.request_metrics.throughput.per_gpu.total_tput_tps | round),
          .request_metrics.latency.ttft.mean] | @tsv' "$f"
done | sort -n
```

Compare matching configurations and units, accounting for rounding in the displayed query. Also check output throughput, E2EL, and TPOT where present. Agentic ITL and interactivity can differ from legacy artifact fields because ingest uses full-response metrics and can reconstruct them from the AIPerf profile; do not assume a fixed tolerance for that difference.

Finally, open the target dashboard's model page in the AgentX view and verify the run's points. Model slugs live in `packages/app/src/lib/compare-slug.ts`; use a model present in the approved run.

## Behavior to expect

- **Dates:** A run is dated by its `created_at`, not by when a later attempt ran.
- **Re-ingest:** The pipeline uses conflict handling for existing rows. Re-ingest is not a database reset and does not guarantee replacement of already-linked trace payloads.
- **Newer runs of the same config:** A new run does not delete an older run's points. Latest-view selection follows the snapshot and append-only rules in [Data Pipeline](./data-pipeline.md). Removing old data is a separate, explicit step through the run-override registry.
- **Cleanup:** Retained artifacts can consume substantial disk space. After verification, remove only the download directory and temporary worktree you created, including the copied `.env`.
