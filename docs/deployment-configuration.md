# Deployment Configuration

Operational values (benchmark source repositories, target sites, database URL names,
Deployment Protection bypass) are read from the environment, GitHub repository
variables, or secrets. Each value is optional unless noted; the defaults below apply
when it is unset.

Site identity stays fixed in code: the canonical `SITE_URL`, the API reference base
URL, About and FAQ repository links, and the H3 video repository.

## Runtime environment

Set these in the app's hosting environment or in the repository root `.env` for
scripts.

| Variable                            | Default                               | Effect                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFERENCEX_SOURCE_REPOS`           | unset                                 | Comma-separated `owner/repo` list searched after `SemiAnalysisAI/InferenceX` for unofficial-run overlays, live GPU metrics, live eval samples, CollectiveX sweeps, and ETL workflow-run lookups. Entries are trimmed and deduplicated; a malformed entry is an error. |
| `COLLECTIVEX_DATABASE_URL`          | unset                                 | Fallback for `DATABASE_COLLECTIVEX_READONLY_URL` (Vercel-managed Neon naming).                                                                                                                                                                                        |
| `COLLECTIVEX_DATABASE_URL_UNPOOLED` | unset                                 | Fallback for `DATABASE_COLLECTIVEX_WRITE_URL`, including CollectiveX ingest and migrations.                                                                                                                                                                           |
| `CACHE_PROTECTION_BYPASS_SECRET`    | unset                                 | Sent as `x-vercel-protection-bypass` by the cache invalidate and warmup scripts, the H3 media warmer, and the PowerX publication verifier.                                                                                                                            |
| `INFERENCEX_APP_URL`                | `https://inferencex.semianalysis.com` | Default origin for `warm-video-results.ts` and `verify-power-publication.ts`; the verifier's origin argument still wins. The cache scripts keep their localhost default.                                                                                              |
| `INGEST_REPO`                       | `SemiAnalysisAI/InferenceX`           | Repository for ingest, backfill, and artifact-preparation scripts when no argument names one. `ingest-ci-run`, `ingest-collectivex`, and the backfills read a full run URL first. CI-mode `ingest-ci-run` requires it.                                                |

`GITHUB_TOKEN` must be able to read Actions runs and artifacts in every listed source
repository. Artifacts from every listed repository are served to any caller through the
routes above.

CollectiveX discovery skips a listed repository that has no sweep workflow, logs and
skips one that cannot be listed for another reason, and fails only when every
repository fails. Runs from a repository other than `SemiAnalysisAI/InferenceX` record
it as `source_repository` in the stored summary, and their links use it.

The database fallbacks never cross scopes: the CollectiveX variables only stand in for
the CollectiveX URLs, and read and write URLs stay separate.

## GitHub Actions

| Name                             | Kind     | Default                               | Effect                                                                                                             |
| -------------------------------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`                        | variable | `https://inferencex.semianalysis.com` | Site targeted by cache invalidation and warmup, OperatorX invalidation, PowerX verification, and H3 media warming. |
| `BENCHMARK_REPO`                 | variable | `SemiAnalysisAI/InferenceX`           | Repository whose benchmark artifacts the ingest workflows download and that dispatches `stage-results`.            |
| `DEV_SITE_URL`                   | variable | current dev preview                   | Site invalidated by the `dev` ingest target.                                                                       |
| `STAGING_SITE_URL`               | variable | current staging preview               | Site invalidated by the `staging` ingest target.                                                                   |
| `CACHE_PROTECTION_BYPASS_SECRET` | secret   | unset                                 | Deployment Protection bypass sent with production and dev site requests, cache scripts, and H3 media warming.      |

`INFX_MAIN_PAT` must be able to read Actions artifacts in `BENCHMARK_REPO`, and `PAT`
must be able to send repository dispatch events to it.

Values reach scripts only through step `env:`, never by inline expression in a `run:`
block.
