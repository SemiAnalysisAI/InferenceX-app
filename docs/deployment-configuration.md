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

| Variable                                              | Required                                                                                            | Effect                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INFERENCEX_SOURCE_REPOS`                             | optional                                                                                            | Comma-separated `owner/repo` list searched after `SemiAnalysisAI/InferenceX` for unofficial-run overlays, live GPU metrics, live eval samples, CollectiveX sweeps, and ETL workflow-run lookups. Entries are trimmed and deduplicated; a malformed entry is an error.                                                    |
| `VERCEL_PROTECTION_BYPASS_SECRET`                     | optional                                                                                            | Sent as `x-vercel-protection-bypass` by the cache invalidate and warmup scripts, the H3 media warmer, and the PowerX publication verifier.                                                                                                                                                                               |
| `INFERENCEX_APP_URL`                                  | `warm-video-results.ts`, and `verify-power-publication.ts` without an origin argument               | Origin for those two scripts. The verifier's origin argument wins when given. The cache scripts keep their localhost default.                                                                                                                                                                                            |
| `INGEST_REPO`                                         | ingest, backfill, and artifact-preparation scripts when no argument or run URL names the repository | Repository for those scripts. `ingest-ci-run`, `ingest-collectivex`, `ingest-operatorx`, and the backfills take a `[repo]` argument or a full run URL first. CI-mode `ingest-ci-run` and `prepare-ci-artifacts` always require it.                                                                                       |
| `DATABASE_READONLY_URL`                               | yes, for the app                                                                                    | Read-only connection for the dashboard API routes. Read-only admin scripts and the MCP server use it too.                                                                                                                                                                                                                |
| `DATABASE_DRIVER`                                     | optional                                                                                            | `neon` (serverless HTTP) or `postgres` (TCP) for the app's database clients. When unset, hosts ending in `.neon.tech` use `neon` and all others use `postgres`. Admin scripts always use `postgres`.                                                                                                                     |
| `DATABASE_SSL`                                        | optional                                                                                            | `false` disables TLS, and `true` or `require` requires it. When unset, TLS is required except for loopback hosts. Read by the app, the admin scripts, and the MCP server.                                                                                                                                                |
| `CACHE_NAMESPACE`                                     | optional, but give each deployment that shares a cache a distinct value                             | Prefixes the server cache keys and the `db`, `collectivex`, and `operatorx` cache tags, so one deployment never serves or purges another deployment's cached data.                                                                                                                                                       |
| `BLOB_CACHE_PREFIX`, `BLOB_READ_WRITE_TOKEN`          | optional                                                                                            | Vercel Blob storage. The blob response cache runs only when both are set. A full invalidation deletes every blob under the prefix, so deployments that share a Blob store need distinct prefixes. H3 video storage needs only `BLOB_READ_WRITE_TOKEN`. Both features turn themselves off when their variables are unset. |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | optional                                                                                            | PostHog project key and host for browser analytics and server-side events. Without the key, analytics is off. Without the host, `https://us.i.posthog.com` is used. Both are inlined at build time (see [Vercel project](#vercel-project)).                                                                              |
| `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`      | optional, at build time, set together                                                               | Production builds upload source maps to PostHog only when both are set.                                                                                                                                                                                                                                                  |
| `GITHUB_TOKEN`                                        | yes, for GitHub-backed features                                                                     | Reads Actions runs and artifacts. Without it, `/api/unofficial-run`, `/api/gpu-metrics` live telemetry, and `/api/v1/eval-samples-live` return 500, CollectiveX discovery reports `unavailable`, and framework release and GitHub star requests go out unauthenticated.                                                  |
| `OPERATORX_SOURCE`                                    | optional                                                                                            | `database`, the behavior when unset, reads `DATABASE_OPERATORX_READONLY_URL`. `local` reads `OPERATORX_LOCAL_ARTIFACT_DIR` and works only in development. Any other value makes `/api/v1/operatorx/*` return 503.                                                                                                        |

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

### Feature variables

The production block of `.env.example` lists the core connection, cache, and analytics
variables. The deployed app also reads the variables below. Each one backs a single
feature, which fails as described when the variable is unset.

| Variable                           | Read by                                   | When unset                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALIDATE_SECRET`                | `POST /api/v1/invalidate`                 | Requests return 500 with `INVALIDATE_SECRET is not set`, except requests to the shared `staging` preview that carry `x-vercel-protection-bypass`. When it is set, a missing or wrong bearer token returns 401. Set it to the value of the `VERCEL_INVALIDATE_SECRET` GitHub secret. |
| `FEEDBACK_SECRET`                  | `POST /api/v1/feedback`                   | Submissions return 500 with code `E_CRYPTO`.                                                                                                                                                                                                                                        |
| `DATABASE_WRITE_URL`               | `POST /api/v1/feedback`                   | Submissions return 500 with code `E_CRYPTO`.                                                                                                                                                                                                                                        |
| `DATABASE_COLLECTIVEX_WRITE_URL`   | `/api/v1/collectivex/*`                   | The routes read and lazily ingest through this primary connection, so they return errors.                                                                                                                                                                                           |
| `COLLECTIVEX_ADMIN_SECRET`         | `DELETE /api/v1/collectivex/runs/[runId]` | Every request returns 500 with `COLLECTIVEX_ADMIN_SECRET is not set`. When it is set, a missing or wrong bearer token returns 401.                                                                                                                                                  |
| `DATABASE_OPERATORX_READONLY_URL`  | `/api/v1/operatorx/*`                     | The routes return 503 with `The OperatorX database is not configured`.                                                                                                                                                                                                              |
| `DATABASE_PROXYTRACE_READONLY_URL` | `/api/v1/agentic-workload-explorer/*`     | The routes return 500.                                                                                                                                                                                                                                                              |

`DATABASE_COLLECTIVEX_READONLY_URL` is not read by the app routes. Every CollectiveX
route reads through `DATABASE_COLLECTIVEX_WRITE_URL`.

A copy of this repository should replace the owner in `.github/CODEOWNERS` with its own.

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
| `APP_URL`         | yes, by every workflow that uses it  | Site targeted by cache invalidation and warmup, OperatorX invalidation, post-deploy OperatorX warmup, H3 media warmup, and PowerX verification on the `production` ingest target.                                           |
| `BENCHMARK_REPO`  | yes, by every workflow that uses it  | Repository whose benchmark artifacts the ingest workflows download and that dispatches `stage-results`. When it is not `SemiAnalysisAI/InferenceX`, also list it in `INFERENCEX_SOURCE_REPOS` for the app's GitHub lookups. |
| `STAGING_APP_URL` | `staging` target and `stage-results` | Site invalidated by the `staging` ingest target and linked from staged chart comments.                                                                                                                                      |

### Secrets

`GITHUB_TOKEN` is provided by GitHub and is not listed. `SLACK_WEBHOOK_URL` is the
failure alarm, so `ingest-results`, `ingest-operatorx`, and `stage-results` check it
before doing any other work. `stage-results` also checks `PAT` up front.
`ingest-operatorx` checks `APP_URL`, `VERCEL_INVALIDATE_SECRET`,
`DATABASE_OPERATORX_WRITE_URL`, and `INFX_MAIN_PAT` in its first step.
`backfill-server-log-files` checks `INFX_MAIN_PAT` before the backfill. `apply-run-overrides`,
`backfill-server-log-files`, and `recompute-agentic-metrics` check `DATABASE_WRITE_URL`
before writing to the production database.

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
| `VERCEL_PROTECTION_BYPASS_SECRET` | optional                                                 | Deployment Protection bypass sent with requests to `APP_URL` and by the cache scripts.                          | `apply-run-overrides`, `backfill-server-log-files`, `cache-refresh`, `h3-media`, `ingest-operatorx`, `ingest-results` on the `production` target, `recompute-agentic-metrics`, `warm-after-deploy`   |
| `VERCEL_STAGING_BYPASS_SECRET`    | yes, for the `staging` and `neon-branch` targets         | Vercel automation bypass for the staging and preview deployments.                                               | `ingest-results`, `stage-results`, `sync-staging-database`                                                                                                                                           |

Values reach scripts only through step `env:`, never by inline expression in a `run:`
block.

`Apply Run Overrides` and `Recompute Agentic Metrics` write to the `DATABASE_WRITE_URL`
secret and invalidate `APP_URL`. Recompute and `Backfill Server Log Files` write that
database only from the repository's default branch. `check-skills-api`, `publish-skills`,
`sync-staging-database`, and `h3-media` operate the public site and its staging database,
so they run only in `SemiAnalysisAI/InferenceX-app`.

### Staging prerequisites

The `staging` ingest target and `stage-results` expect:

- a Neon branch named `staging`, whose write connection is `DATABASE_STAGING_WRITE_URL`
- a Git branch named `staging`, which `stage-results` moves to the head of the repository's
  default branch before each ingest, creating it when missing
- a Vercel preview deployment of that Git branch
- `STAGING_APP_URL` pointing at that preview

`/api/v1/invalidate` accepts the `x-vercel-protection-bypass` header in place of
`INVALIDATE_SECRET` only on the preview built from the `staging` Git branch
(`VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=staging`). Every other deployment
requires the bearer token.
