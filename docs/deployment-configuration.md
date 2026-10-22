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

| Variable                         | Required                                                                                            | Effect                                                                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFERENCEX_SOURCE_REPOS`        | optional                                                                                            | Comma-separated `owner/repo` list searched after `SemiAnalysisAI/InferenceX` for unofficial-run overlays, live GPU metrics, live eval samples, CollectiveX sweeps, and ETL workflow-run lookups. Entries are trimmed and deduplicated; a malformed entry is an error. |
| `CACHE_PROTECTION_BYPASS_SECRET` | optional                                                                                            | Sent as `x-vercel-protection-bypass` by the cache invalidate and warmup scripts, the H3 media warmer, and the PowerX publication verifier.                                                                                                                            |
| `INFERENCEX_APP_URL`             | `warm-video-results.ts`, and `verify-power-publication.ts` without an origin argument               | Origin for those two scripts. The verifier's origin argument wins when given. The cache scripts keep their localhost default.                                                                                                                                         |
| `INGEST_REPO`                    | ingest, backfill, and artifact-preparation scripts when no argument or run URL names the repository | Repository for those scripts. `ingest-ci-run`, `ingest-collectivex`, `ingest-operatorx`, and the backfills take a `[repo]` argument or a full run URL first. CI-mode `ingest-ci-run` and `prepare-ci-artifacts` always require it.                                    |

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

## GitHub Actions

| Name                             | Kind     | Required                            | Effect                                                                                                                                                                                                                      |
| -------------------------------- | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                        | variable | yes, by every workflow that uses it | Site targeted by cache invalidation and warmup, OperatorX invalidation, H3 media warmup, and PowerX verification on the `production` ingest target.                                                                         |
| `BENCHMARK_REPO`                 | variable | yes, by every workflow that uses it | Repository whose benchmark artifacts the ingest workflows download and that dispatches `stage-results`. When it is not `SemiAnalysisAI/InferenceX`, also list it in `INFERENCEX_SOURCE_REPOS` for the app's GitHub lookups. |
| `DEV_SITE_URL`                   | variable | `dev` ingest target only            | Site invalidated by the `dev` ingest target.                                                                                                                                                                                |
| `STAGING_SITE_URL`               | variable | `staging` ingest target only        | Site invalidated by the `staging` ingest target.                                                                                                                                                                            |
| `CACHE_PROTECTION_BYPASS_SECRET` | secret   | optional                            | Deployment Protection bypass sent with production and dev site requests and by the cache scripts.                                                                                                                           |

`INFX_MAIN_PAT` must be able to read Actions artifacts in `BENCHMARK_REPO`, and `PAT`
must be able to send repository dispatch events to it.

Values reach scripts only through step `env:`, never by inline expression in a `run:`
block.

`Apply Run Overrides` and `Recompute Agentic Metrics` write to the `DATABASE_WRITE_URL`
secret and invalidate `APP_URL`. Recompute writes that database only from the repository's
default branch. `check-skills-api`, `sync-staging-database`, and `h3-media` operate the
public site and its staging database, so they run only in `SemiAnalysisAI/InferenceX-app`.
