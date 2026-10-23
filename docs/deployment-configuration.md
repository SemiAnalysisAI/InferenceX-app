# Deployment Configuration

Operational values (benchmark source repositories, target sites, Deployment Protection
bypass) are read from the environment, GitHub repository variables, or secrets. There
are no defaults: a required value that is unset fails the script or workflow step that
needs it, with an error naming the variable.

Site identity stays fixed in code: the canonical `SITE_URL`, the API reference base
URL, About and FAQ repository links, and the H3 video repository.

## Runtime environment

Set these in the app's hosting environment or in the repository root `.env` for
scripts.

| Variable                          | Required                                                                                            | Effect                                                                                                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFERENCEX_SOURCE_REPOS`         | optional                                                                                            | Comma-separated `owner/repo` list searched after `SemiAnalysisAI/InferenceX` for unofficial-run overlays, live GPU metrics, live eval samples, CollectiveX sweeps, and ETL workflow-run lookups. Entries are trimmed and deduplicated; a malformed entry is an error. |
| `VERCEL_PROTECTION_BYPASS_SECRET` | optional                                                                                            | Sent as `x-vercel-protection-bypass` by the cache invalidate and warmup scripts, the H3 media warmer, and the PowerX publication verifier.                                                                                                                            |
| `INFERENCEX_APP_URL`              | `warm-video-results.ts`, and `verify-power-publication.ts` without an origin argument               | Origin for those two scripts. The verifier's origin argument wins when given. The cache scripts keep their localhost default.                                                                                                                                         |
| `INGEST_REPO`                     | ingest, backfill, and artifact-preparation scripts when no argument or run URL names the repository | Repository for those scripts. `ingest-ci-run`, `ingest-collectivex`, `ingest-operatorx`, and the backfills take a `[repo]` argument or a full run URL first. CI-mode `ingest-ci-run` and `prepare-ci-artifacts` always require it.                                    |

`GITHUB_TOKEN` must be able to read Actions runs and artifacts in every listed source
repository. Artifacts from every listed repository are served to any caller through
`/api/unofficial-run`, `/api/gpu-metrics`, `/api/v1/eval-samples-live`, and
`/api/v1/collectivex/*`.

CollectiveX discovery skips a listed repository whose sweep-workflow listing returns 404.
GitHub also returns 404 for a misspelled repository or one the token cannot see, so
check the token's access when a repository's sweeps do not appear. A repository that
fails to list for another reason is logged, and the pass counts as failed: the runs list
stays incomplete and retries after a short cooldown. Runs from a repository other than
`SemiAnalysisAI/InferenceX` record it as `source_repository` in the stored summary, and
their links use it.

### Variables outside the `.env.example` production list

The production block of `.env.example` says all of its variables are required, but the
deployed app also reads the variables below. Each one backs a single feature, which fails
as described when the variable is unset.

| Variable                           | Read by                                   | When unset                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALIDATE_SECRET`                | `POST /api/v1/invalidate`                 | Every request returns 401, except requests to the shared `staging` preview that carry `x-vercel-protection-bypass`. Set it to the value of the `VERCEL_INVALIDATE_SECRET` GitHub secret. |
| `FEEDBACK_SECRET`                  | `POST /api/v1/feedback`                   | Submissions return 500 with code `E_CRYPTO`.                                                                                                                                             |
| `DATABASE_WRITE_URL`               | `POST /api/v1/feedback`                   | Submissions return 500 with code `E_CRYPTO`.                                                                                                                                             |
| `DATABASE_COLLECTIVEX_WRITE_URL`   | `/api/v1/collectivex/*`                   | The routes read and lazily ingest through this primary connection, so they return errors.                                                                                                |
| `COLLECTIVEX_ADMIN_SECRET`         | `DELETE /api/v1/collectivex/runs/[runId]` | Every request returns 401.                                                                                                                                                               |
| `DATABASE_OPERATORX_READONLY_URL`  | `/api/v1/operatorx/*`                     | The routes return 503 with `The OperatorX database is not configured`.                                                                                                                   |
| `DATABASE_PROXYTRACE_READONLY_URL` | `/api/v1/agentic-workload-explorer/*`     | The routes return 500.                                                                                                                                                                   |

### Vercel project

The Vercel project's Root Directory is `packages/app`. Vercel reads `vercel.json` only
from the Root Directory, so the project configuration lives in `packages/app/vercel.json`,
and the repository root `.vercelignore` assumes that layout.

`NEXT_PUBLIC_*` values, such as `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`,
are inlined into the client bundle at build time. After changing one in the Vercel
project, redeploy for the new value to take effect.

## GitHub Actions

### Variables

| Name              | Required                             | Effect                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`         | yes, by every workflow that uses it  | Site targeted by cache invalidation and warmup, OperatorX invalidation, H3 media warmup, and PowerX verification on the `production` ingest target.                                                                         |
| `BENCHMARK_REPO`  | yes, by every workflow that uses it  | Repository whose benchmark artifacts the ingest workflows download and that dispatches `stage-results`. When it is not `SemiAnalysisAI/InferenceX`, also list it in `INFERENCEX_SOURCE_REPOS` for the app's GitHub lookups. |
| `STAGING_APP_URL` | `staging` target and `stage-results` | Site invalidated by the `staging` ingest target and linked from staged chart comments.                                                                                                                                      |

### Secrets

`GITHUB_TOKEN` is provided by GitHub and is not listed. `SLACK_WEBHOOK_URL` is the
failure alarm, so `ingest-results`, `ingest-operatorx`, and `stage-results` check it
before doing any other work. `stage-results` also checks `PAT` up front, and
`apply-run-overrides` and `recompute-agentic-metrics` check `DATABASE_WRITE_URL` before
writing to the production database.

| Secret                            | Required                                                 | Used for                                                                                                        | Workflows                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SLACK_WEBHOOK_URL`               | yes                                                      | Incoming webhook for ingest failure and unmapped-entity alerts.                                                 | `ingest-results`, `ingest-operatorx`, `stage-results` (passed to `ingest-results`)                                                                                                                   |
| `DATABASE_WRITE_URL`              | yes, for writes to the production database               | Production database write connection.                                                                           | `apply-run-overrides`, `ingest-results` on the `production` target, `backfill-server-log-files` and `recompute-agentic-metrics` without `neon-branch`                                                |
| `DATABASE_STAGING_WRITE_URL`      | yes, for the `staging` target                            | Write connection for the Neon `staging` branch.                                                                 | `ingest-results`, `stage-results`                                                                                                                                                                    |
| `DATABASE_OPERATORX_WRITE_URL`    | yes, by `ingest-operatorx`                               | OperatorX database write connection for migrations and ingest.                                                  | `ingest-operatorx`                                                                                                                                                                                   |
| `INFX_MAIN_PAT`                   | yes                                                      | Reads Actions runs and artifacts in `BENCHMARK_REPO`.                                                           | `ingest-results`, `ingest-operatorx`, `stage-results`, `backfill-server-log-files`, `recompute-agentic-metrics` with `restore-missing-trace`                                                         |
| `PAT`                             | yes, by `stage-results`                                  | Sends the `stage-results-started` and `stage-results-completed` repository dispatch events to `BENCHMARK_REPO`. | `stage-results`                                                                                                                                                                                      |
| `NEON_API_KEY`                    | yes, for Neon branch operations                          | Resolves named Neon child branches and restores or syncs the `staging` branch.                                  | `ingest-results` on the `neon-branch` target, `backfill-server-log-files` and `recompute-agentic-metrics` with `neon-branch`, `stage-results` with `reset-staging-database`, `sync-staging-database` |
| `NEON_PROJECT_ID`                 | with `NEON_API_KEY`                                      | Neon project that holds those branches.                                                                         | Same as `NEON_API_KEY`                                                                                                                                                                               |
| `VERCEL_INVALIDATE_SECRET`        | yes, for cache invalidation outside the `staging` target | Bearer token for `/api/v1/invalidate`. It must equal the app's runtime `INVALIDATE_SECRET`.                     | `apply-run-overrides`, `backfill-server-log-files`, `cache-refresh`, `ingest-operatorx`, `ingest-results`, `recompute-agentic-metrics`                                                               |
| `VERCEL_PROTECTION_BYPASS_SECRET` | optional                                                 | Deployment Protection bypass sent with requests to `APP_URL` and by the cache scripts.                          | `apply-run-overrides`, `backfill-server-log-files`, `cache-refresh`, `h3-media`, `ingest-operatorx`, `ingest-results` on the `production` target, `recompute-agentic-metrics`                        |
| `VERCEL_STAGING_BYPASS_SECRET`    | yes, for the `staging` and `neon-branch` targets         | Vercel automation bypass for the staging and preview deployments.                                               | `ingest-results`, `stage-results`, `sync-staging-database`                                                                                                                                           |

Values reach scripts only through step `env:`, never by inline expression in a `run:`
block.

`Apply Run Overrides` and `Recompute Agentic Metrics` write to the `DATABASE_WRITE_URL`
secret and invalidate `APP_URL`. Recompute writes that database only from the repository's
default branch. `check-skills-api`, `sync-staging-database`, and `h3-media` operate the
public site and its staging database, so they run only in `SemiAnalysisAI/InferenceX-app`.
