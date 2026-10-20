# Deployment Configuration

Operational values (benchmark source repositories, target sites, database URL names,
Deployment Protection bypass) and a few product defaults are read from the environment,
GitHub repository variables, or secrets. Every value is optional; the defaults below
apply when it is unset.

Site identity stays fixed in code: the canonical `SITE_URL`, the API reference base
URL, About and FAQ repository links, and the H3 video repository.

## Runtime environment

Set these in the app's hosting environment or in the repository root `.env` for
scripts.

| Variable                            | Default                     | Effect                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFERENCEX_SOURCE_REPOS`           | unset                       | Comma-separated `owner/repo` list searched after `SemiAnalysisAI/InferenceX` for unofficial-run overlays, live GPU metrics, live eval samples, CollectiveX sweeps, and ETL workflow-run lookups. Entries are trimmed and deduplicated; a malformed entry is an error. |
| `COLLECTIVEX_DATABASE_URL`          | unset                       | Fallback for `DATABASE_COLLECTIVEX_READONLY_URL` (Vercel-managed Neon naming).                                                                                                                                                                                        |
| `COLLECTIVEX_DATABASE_URL_UNPOOLED` | unset                       | Fallback for `DATABASE_COLLECTIVEX_WRITE_URL`, including CollectiveX ingest and migrations.                                                                                                                                                                           |
| `CACHE_PROTECTION_BYPASS_SECRET`    | unset                       | Sent as `x-vercel-protection-bypass` by the cache invalidate and warmup scripts, the H3 media warmer, and the PowerX publication verifier.                                                                                                                            |
| `INFERENCEX_APP_URL`                | public site                 | Default origin for `warm-video-results.ts` and `verify-power-publication.ts`; an explicit origin argument still wins. The cache scripts keep their localhost default.                                                                                                 |
| `INGEST_REPO`                       | `SemiAnalysisAI/InferenceX` | Repository for ingest, backfill, and artifact-preparation scripts when no argument names one. `ingest-ci-run`, `ingest-collectivex`, and the backfills also read it from a full run URL first.                                                                        |

`GITHUB_TOKEN` must be able to read Actions runs and artifacts in every listed source
repository. The routes above serve those artifacts to any caller, so list only
repositories whose artifacts may be public.

CollectiveX discovery skips, and logs, a source repository that cannot be listed; it
fails only when every repository fails. Runs from a repository other than
`SemiAnalysisAI/InferenceX` record it as `source_repository` in the stored summary, and
their links use it.

The database fallbacks never cross scopes: the CollectiveX variables only stand in for
the CollectiveX URLs, and read and write URLs stay separate.

## Product flags

Build-time flags (`NEXT_PUBLIC_*`), read once in
`packages/app/src/lib/config/deployment-flags.ts`. Values are trimmed and
case-insensitive; unrecognized values fall back to the default.

| Variable                                 | Values                           | Effect                                                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_DEFAULT_TCO_BASIS`          | `internal` (default), `external` | Basis for every cost figure without an explicit basis (dashboard, calculators, compare and overview pages), the views API default, and the `g_tco` share-link default. Links encode only the non-default basis; both values parse. |
| `NEXT_PUBLIC_TCO_BASIS_SELECTOR`         | `scoped` (default), `always`     | `scoped` shows the TCO basis control only for supported models and scenarios, and on inference and throughput views only when owner-cost hardware is on screen. `always` shows it on every cost metric and reserves its column.    |
| `NEXT_PUBLIC_DISABLED_THEMES`            | comma list, default none         | Optional theme ids (`minecraft`, `csgo`, `gta`, `doom`, `halo`) removed from the theme toggle. Their JavaScript is never loaded, and a saved disabled theme resets to dark after hydration. `light` and `dark` cannot be disabled. |
| `NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE` | `on` (default), `off`            | `off` keeps the unofficial-run text watermark and drops the decorative image.                                                                                                                                                      |

## GitHub Actions

| Name                             | Kind     | Default                               | Effect                                                                                                             |
| -------------------------------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`                        | variable | `https://inferencex.semianalysis.com` | Site targeted by cache invalidation and warmup, OperatorX invalidation, PowerX verification, and H3 media warming. |
| `BENCHMARK_REPO`                 | variable | `SemiAnalysisAI/InferenceX`           | Repository whose benchmark artifacts the ingest workflows download and that dispatches `stage-results`.            |
| `DEV_SITE_URL`                   | variable | current dev preview                   | Site invalidated by the `dev` ingest target.                                                                       |
| `STAGING_SITE_URL`               | variable | current staging preview               | Site invalidated by the `staging` ingest target.                                                                   |
| `CACHE_PROTECTION_BYPASS_SECRET` | secret   | unset                                 | Deployment Protection bypass sent with production and dev site requests, cache scripts, and H3 media warming.      |

Values reach scripts only through step `env:`, never by inline expression in a `run:`
block.
