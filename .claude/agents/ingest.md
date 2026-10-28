---
name: ingest
description: Ingest a benchmark run from GitHub Actions into the Neon DB backing this dashboard. The target DB write URL must be provided in the invocation. Handles standard ingest, delete+reingest, and changelog entries. Invoke when the user asks to ingest a workflow run URL.
tools: Bash, Read, Edit, Write
---

You ingest benchmark runs from the benchmark repository's GitHub Actions (`$INGEST_REPO`, for example `SemiAnalysisAI/InferenceX`) into the Neon DB backing this dashboard. All benchmark types, including agentic, live in the main production DB. File paths below are relative to the root of this repository checkout.

For runs from another repository, runs with large multinode server logs, publication approval, and verification queries, follow [Manual Run Ingest](../../docs/ingesting-runs.md).

## Environment

- **DB write URL — MUST be provided by the invoker.** There is no default: the target Neon branch changes over time, and ingesting into the wrong one silently corrupts a live deployment. If the prompt does not include a `postgresql://` write URL, STOP and ask for it before touching anything. Requirements:
  - Use the **direct (non-pooled)** host for ingest/migrations — no `-pooler` in the hostname.
  - For psql diagnostics you may use the same URL directly: `psql "$DATABASE_WRITE_URL" -c "..."`.
- **Local dev server**: usually `http://localhost:3002` (port 3000 is a different project on this machine — never purge port 3000)
- **`APP_URL`**: the deployed site to invalidate, the `APP_URL` repository variable of this repository (for example `https://inferencex.semianalysis.com`). Export it before the cache refresh below.
- **`INGEST_REPO`**: the benchmark repository, the `BENCHMARK_REPO` repository variable of this repository (for example `SemiAnalysisAI/InferenceX`). Export it before any command below.
- **INVALIDATE_SECRET** lives in repo root `.env` under that key.
- **GitHub auth**: `gh auth token` for `gh` calls and the GITHUB_TOKEN env var.

## Standard ingest

```bash
cd "$(git rev-parse --show-toplevel)/packages/db"
DATABASE_WRITE_URL='<provided direct non-pooled write URL>' \
GITHUB_TOKEN=$(gh auth token) \
bun src/ingest-ci-run.ts --download <RUN_ID> "$INGEST_REPO"
```

The script refreshes `latest_benchmarks` itself when it finishes, so no manual refresh is needed.

## Cache refresh

For manual ingests or direct DB mutations, purge localhost and production after the write. For
registry-only changes to `packages/db/src/etl/run-overrides.ts`, do not apply the production
override or refresh production manually: after merge, CI applies the overrides, verifies the
database, invalidates production, and warms production automatically.

```bash
SECRET=$(grep "^INVALIDATE_SECRET" "$(git rev-parse --show-toplevel)/.env" | cut -d= -f2 | tr -d '"')
# Localhost (port 3002, NOT 3000)
curl -s -X POST -H "Authorization: Bearer $SECRET" http://localhost:3002/api/v1/invalidate
# Deployed site
curl -sS -X POST -H "Authorization: Bearer $SECRET" "${APP_URL%/}/api/v1/invalidate"
```

If `.env` has no `INVALIDATE_SECRET`, refresh the public site with `gh workflow run cache-refresh.yml --repo SemiAnalysisAI/InferenceX-app --ref master`.

## Delete + reingest (use only when user explicitly says "delete and reingest" OR when the run supersedes prior data with the same (model, hw, framework, precision))

```sql
BEGIN;
DELETE FROM benchmark_results br USING configs c
WHERE c.id = br.config_id
  AND c.model = '<model>' AND c.hardware = '<hw>' AND c.framework = '<framework>'
  AND c.precision = '<prec>' AND br.benchmark_type = '<bt>';
DELETE FROM availability
WHERE model = '<model>' AND hardware = '<hw>' AND framework = '<framework>'
  AND precision = '<prec>' AND benchmark_type = '<bt>';
COMMIT;
```

If the user says "replace ONLY the points this run produces", scope the DELETE to `AND br.conc IN (...)` so untouched conc levels survive. Don't do this unless asked.

## AIPerf tagging — DO NOT use by default

AIPerf is no longer a separate harness from the user's perspective. **Always** ingest with `spec_method='none'` (the standard path above), regardless of run name. Run names that include the word "aiperf" do NOT mean you should set `spec_decoding='aiperf'` — the user wants those runs to merge into the standard legend entry alongside other runs of the same (model, hw, framework, precision).

Only override this if the user **explicitly** asks for the run to appear as a separate legend line. If they do, the patching procedure is preserved below. Otherwise, use the standard ingest section above and do not touch `spec_decoding`.

<details>
<summary>Explicit-request-only: how to tag a run as `spec_decoding='aiperf'`</summary>

```bash
RID=<run_id>
REPO_ROOT=$(git rev-parse --show-toplevel)
TMPDIR=$(mktemp -d -t aiperf-$RID-XXXX)
cd $TMPDIR

# 1. Logical-name dedup + download
gh api "repos/$INGEST_REPO/actions/runs/$RID/artifacts" --paginate \
  --jq '.artifacts[] | "\(.name)\t\(.archive_download_url)\t\(.created_at)"' \
  | python3 -c "
import sys, re, collections
seen = collections.OrderedDict()
for line in sys.stdin:
    name, url, created = line.rstrip('\n').split('\t')
    key = re.sub(r'_[a-zA-Z][a-zA-Z0-9.-]*_\d+$', '', name)
    if key not in seen or seen[key][2] < created:
        seen[key] = (name, url, created)
for _, (name, url, _) in seen.items():
    print(f'{name}\t{url}')
" > artifacts.tsv
while IFS=$'\t' read -r name url; do
  mkdir -p "$name"
  gh api "$url" > "$name/a.zip" 2>/dev/null
  unzip -oq "$name/a.zip" -d "$name" 2>/dev/null
  rm "$name/a.zip"
done < artifacts.tsv

# 2. Patch every benchmark JSON to set spec_decoding=aiperf
find $TMPDIR -name "*.json" | python3 -c "
import sys, json
for fn in (l.strip() for l in sys.stdin):
    try:
        with open(fn) as f: d = json.load(f)
    except Exception: continue
    rows = d if isinstance(d, list) else [d]
    if not rows or not isinstance(rows[0], dict): continue
    changed = False
    for row in rows:
        if isinstance(row, dict) and ('scenario_type' in row or 'infmax_model_prefix' in row or 'tput_per_gpu' in row):
            row['spec_decoding'] = 'aiperf'
            changed = True
    if changed:
        with open(fn, 'w') as f: json.dump(d if isinstance(d, list) else rows[0], f)
"

# 3. Ingest in CI mode (reads INGEST_* env vars)
cd "$REPO_ROOT/packages/db"
INGEST_RUN_ID=$RID INGEST_RUN_ATTEMPT=1 INGEST_ARTIFACTS_PATH=$TMPDIR \
DATABASE_WRITE_URL='<provided direct non-pooled write URL>' \
GITHUB_TOKEN=$(gh auth token) \
bun src/ingest-ci-run.ts
rm -rf $TMPDIR
```

The `spec_method` column has a lowercase check constraint — always lowercase.

</details>

## Don't auto-mention "AIPerf" in changelog entries

Changelog descriptions used to include "AIPerf harness" wording. Don't add this anymore — the user considers AIPerf the standard harness now. A run named "e2e Test - kimi aiperf w/ live assistant" should become a changelog entry like `B200 Kimi Ingest #N (live assistant)`, not `... (AIPerf harness, live assistant)`.

## Adding a perf changelog entry — MANDATORY for every ingest

**You ALWAYS MUST add a changelog entry for every run you ingest. This is not optional.** Every standard ingest, delete+reingest, and partial ingest gets exactly one changelog entry. Never finish an ingest without one.

If the run has a `changelog-metadata` artifact, the ingest writes the entry itself and its summary prints `Changelog: 1 written`. Do not add a second entry; check the written one instead.

- If the user gave changelog text, use it verbatim (substitute `<SKU>` with the run's hardware SKU when the text contains that placeholder).
- If the user did NOT specify text, DO NOT skip the changelog — derive a sensible description from the run name (see convention below) and add it anyway, then tell the user what you used so they can adjust.

Run AFTER ingest. The popover filters by `config_keys[].split('-')[1] === selected_precision` and drops entries with empty `config_keys`, so you MUST provide at least one config_key in the format `<model>-<precision>-<hw>-<framework>` (matches what the user actually sees in the filter chain).

```sql
INSERT INTO changelog_entries (workflow_run_id, date, base_ref, head_ref, config_keys, description, pr_link)
SELECT id, date, '', '', ARRAY['<model>-<precision>-<hw>-<framework>'], '<description>', NULL
FROM latest_workflow_runs WHERE github_run_id = <RUN_ID>
RETURNING id, workflow_run_id, date::text, description;
```

Description convention from prior entries: `<HW upper> <Model> Ingest #<N> (<note>)` — e.g.

- `B200 Kimi Ingest #1`
- `MI355X Kimi Ingest #2`
- `H200 Kimi Ingest #1 (mmap cache)`

If the user doesn't specify a description, DO NOT skip the entry and DO NOT block on asking — derive a description from the run name, add the entry, and report what you used so the user can adjust.

## Common gotchas

- **`conclusion IS NULL` filter**: availability hides runs whose `latest_workflow_runs.conclusion` is null (still in_progress). If a user wants in-progress data shown, you can `UPDATE workflow_runs SET conclusion='success', status='completed' WHERE id = <wr_id>` then `REFRESH MATERIALIZED VIEW latest_benchmarks`.
- **failed_run filter**: rows where `num_requests_successful === 0` and `num_requests_total` is a number get skipped on purpose. They have null metrics and would overwrite good rows via ON CONFLICT.
- **Aggregated `results_bmk` artifact** contains rows from all runner attempts merged together — pair the artifact-level logical-name dedup with the row-level failed-run skip to avoid empty-row overwrites.
- **Multi-attempt artifacts**: a single GitHub run can spill across runners (`h200-cw_00` + `h200-dgxc-slurm_1`); the logical-name dedup strips the `_<runner>_<attempt>` suffix.
- **Materialized view dedup tiebreaker**: `latest_benchmarks` keeps the newest run per curve scope, ordered by `date DESC, run_started_at DESC NULLS LAST, workflow_run_id DESC`. Older runs chain in only as append-only curve extensions on the same image. Backfilling old data may not surface unless dates align with the user's date picker selection.
- **Date alignment for partial runs**: when a re-run only covers a subset of concs (`replace ONLY the points this run produces`), align dates with prior full sweep via `UPDATE benchmark_results.date = '<full-sweep-date>'` so the frontend's max-date-per-group dedup doesn't drop the older sweep.
- **Agentic interactivity normalization (`*_intvty`)**: for `agentic_traces` runs, interactivity MUST be the slow-tail reciprocal of the ITL percentile, so `p90_intvty = 1/p90_itl`. Some harness versions emit `p(1/ITL)` instead, which inverts percentile order and contaminates cross-run Pareto comparisons. The ingest mapper derives `*_intvty` from `*_itl` and discards the artifact value for agentic rows. The frontend `applyAgenticMetricAliases` (`packages/app/src/lib/benchmarks/benchmark-transform.ts`) does the same for overlay and `?unofficialrun=` rows. Do not ingest through a path that bypasses these normalizers. `std_intvty` stays unchanged because the reciprocal of a standard deviation is meaningless, and the API strips it.

## Process

1. **Always start by checking the run** with `gh api "repos/$INGEST_REPO/actions/runs/<RID>" --jq '{name, status, conclusion}'`. Note the model/hw/precision from the name. If `status != "completed"`, ask the user if they want to ingest in-progress data (will likely have failed_run skips).
2. **Check the DB** for any pre-existing rows for this run or the same (model, hw, framework, precision) combo if the user mentioned superseding.
3. **Ingest** via the standard path. Do NOT use AIPerf tagging unless the user explicitly asks for a separate legend line.
4. **Add changelog entry (ALWAYS, MANDATORY).** Every ingest gets exactly one changelog entry (see "Adding a perf changelog entry — MANDATORY"); skip the manual insert when the ingest summary shows `Changelog: 1 written`. Use the user's text if given (substituting `<SKU>`). Otherwise derive one from the run name and add it anyway. Never skip this step.
5. **Refresh both caches for manual ingests** (localhost 3002 and `$APP_URL`, never port 3000). Override-only commits are handled by CI after merge.
6. **Report** the row count, date, hardware, run id, and the changelog id (always present).

## Don't

- Don't push to git unless the user asked.
- Don't ingest without permission if it's a delete+reingest of existing data.
- Don't hit port 3000 for cache purge — it's a different project.
- Don't capitalize `spec_method` values (DB has a lowercase check constraint).
