# TPU publication preparation — local branch audit

This is a local preparation document, not a publication or deployment request. The branch is `local/work-2026-09-02`, based on public `master` at `39f83ebc`. It has no upstream, and its branch-specific `pushRemote` remains `/dev/null`. No TPU code, results, credentials, or database changes have been published.

## Current user-directed scope

On September 3 the user limited this task to porting the existing TPU behavior from `/Users/alec/projects/inferencex-app-private-tpu` (`4398850`) into the current app. Retain the previously requested Teacup purple palette, conditional TCO switch and revised switch placement, and local preview. Make only compatibility adaptations needed by the newer app architecture. The five additional improvements identified in the follow-up review below were not implemented and are explicitly excluded from this task. Do not expand into calculator cleanup, new ingestion validation policy, export provenance features, additional launch surfaces, or production operations.

## Recommendation

Port the TPU behavior selectively onto the current architecture. Do not merge or cherry-pick the private fork wholesale. Register the hardware, establish a reproducible physical-chip data contract, carry that count and DP through the UI, and verify the economic inputs. Treat the old Internal/External TCO switch as a separate product decision: publishing throughput results does not require it.

Teacup's palette has already been changed to purple at the user's request, including normal colors and the high-contrast vendor preference/constraint. Unknown-color bands were narrowed to avoid overlapping Teacup. Google can occupy the blue band in the later TPU registration change. Single-vendor high-contrast mode retains its existing full-spectrum behavior.

## Sources inspected

- Current app: `39f83ebc`; 266 commits after the shared ancestor `7067f0c`.
- Private working checkout: `/Users/alec/projects/inferencex-app-private-tpu`, clean at `4398850` (2026-08-05).
- That checkout also has a cached `origin/master` at `af6660d`, six commits ahead. Those later changes concern CollectiveX and private ingest/cache infrastructure, not another TPU inference implementation. The private remote was not fetched or changed.
- The private branch differs from the shared ancestor in 75 files. Relevant commits include `11ead89` / `92c6f3f` (TPU dashboard and TCO), `246e90e` (physical chips and DP), `6058dac` (TPU7x naming), and `4398850` (physical-count ingest fix/backfill).
- Independently retrieved the metadata, job/artifact list, `results_bmk/agg_bmk.json`, and `eval_results_all/agg_eval_all.json` for [run 30864013158](https://github.com/SemiAnalysisAI/InferenceX-Private-TPU/actions/runs/30864013158).
- Retrieved the runner's `utils/process_result.py` and `benchmarks/single_node/qwen3.5_fp8_tpuv7.sh` at the run's exact source commit, `00b9a76a6266870a599d2ebb28c8739c4310205e`.
- Source artifacts and the diagnostic probe are outside the repository in `/private/tmp/inferencex-tpu-audit.mNGVFQ/`. No production or private database was queried or modified.

The run above is a concrete historical reference found in the private tests. It is **not yet a user-confirmed list of results to publish**. Additional runs, models, hardware generations, or newer producer formats need their own artifact check.

## Verified data issues

The reference run is Qwen3.5-397B-A17B FP8, vLLM, 8192 input / 1024 output tokens, standard decoding. Its aggregate artifacts contain six benchmark rows and three evaluation rows. These existing model, framework, precision, and sequence registrations need no additions.

The old producer divides single-node throughput by `TP / 2` for `tpuv7`; its serving script separately passes `--data-parallel-size="$DP"`. The result normalizer omits DP from the denominator and from the emitted metadata. The private backfill documents the deployed configurations as TP8/DP1 and TP1/DP8, both using four physical chips.

| Reference row       | Raw total tok/s/chip field | Correction supported by the private backfill                         | Corrected total tok/s/chip |
| ------------------- | -------------------------: | -------------------------------------------------------------------- | -------------------------: |
| TP8, concurrency 64 |         3705.8131472623354 | Keep throughput; fix physical count from 8 to 4                      |         3705.8131472623354 |
| TP1, concurrency 64 |         29398.734613014203 | Divide total, input, and output throughput by 8; physical count is 4 |         3674.8418266267754 |

Corrected TP1 output throughput is `407.69162901997095` tok/s/chip, and input throughput is `3267.1501976068043`. Latencies and concurrency are not part of this correction.

A process-local diagnostic against the current app reproduced the following, without editing its TPU registry or writing a database:

1. All six benchmark and three evaluation rows are skipped as unknown hardware.
2. Adding `tpuv7` only inside the diagnostic process makes the rows map, but their physical counts become 8 or 1 from TP rather than 4.
3. Supplying `num_gpus: 4` to a benchmark row still yields one chip for TP1. The current mapper captures `num_gpus` as an unexpected numeric metric instead of a topology field.
4. Supplying `num_gpus: 4` to an evaluation row also leaves its count at 8 or 1. The private fork's benchmark-only fix does not cover this.
5. Even when the probe supplies a corrected DB-shaped row with both counts set to 4 and `metrics.dp: 8`, the chart point loses DP and aggregate physical counts, and its overloaded `tp` remains 1.

The private Cypress fixture is not a faithful transcription of this run: it combines TP1, DP8 and concurrency 256 with approximately the TP8/concurrency-64 throughput. It also mostly asserts visibility. Replace it with tests derived from actual source rows and exact numerical assertions.

## Required implementation work

### 1. Register TPU and Google without disturbing other hardware

| Current file                                                  | Change                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/constants/src/gpu-keys.ts`                          | Add canonical key `tpuv7`, vendor `Google`, architecture `Ironwood`, and the private fork's final display label `TPU7x` unless launch naming differs. Pick a unique sort position; the private value 10 now belongs to Jalapeño. Add Google color zones alongside the new purple Teacup zones. Economic values require the decision below. |
| `packages/app/src/lib/dynamic-colors.ts`                      | Extend `Vendor` and registry/literal-vendor detection with Google.                                                                                                                                                                                                                                                                         |
| `packages/app/src/lib/chart-utils.ts`                         | Add Google's high-contrast preference/constraint entries. Preserve current Teacup support and the single-vendor full-spectrum behavior.                                                                                                                                                                                                    |
| `packages/app/src/components/inference/utils/quickFilters.ts` | Its vendor order is still hardcoded to NVIDIA/AMD. Include Google and preserve Teacup, preferably deriving the available vendors from the registry with an explicit display order.                                                                                                                                                         |

The existing `hwToGpuKey` already strips runner suffixes and lowercases `TPUV7`; adding the registry key is sufficient for the observed identifiers. Do not restore the private fork's old suffix-normalization logic or invent aliases for unobserved hardware names.

### 2. Fix ingestion and historical normalization together

| Current file / proposed addition                                                        | Change                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/etl/benchmark-mapper.ts`                                               | Honor a valid explicit aggregate `num_gpus` physical count, classify it as topology rather than a metric, and retain the existing v1/v2 fallbacks when the explicit field is absent. Preserve explicit role counts and current aggregate-engine mirroring.                                                                        |
| `packages/db/src/etl/eval-mapper.ts`                                                    | Apply the same physical-count semantics to both individual and aggregate evaluation artifacts. The v2-shaped reference eval rows need a global physical-count fallback when per-role physical counts are missing.                                                                                                                 |
| `packages/constants/src/metric-keys.ts`                                                 | Register numeric DP metadata if it is retained in benchmark metrics, so valid producer metadata does not generate unknown-metric warnings. Do not confuse numeric DP with the existing boolean `dp_attention`.                                                                                                                    |
| A shared, provenance-scoped TPU normalization helper                                    | Correct the explicitly approved historical runs before config identity and metrics are persisted. Use run/attempt/source-version evidence, not a universal rule that every TPU has four chips or that every TP1 result must be divided by eight. Feed both ingestion and live overlay normalization through this same correction. |
| `packages/app/src/app/api/unofficial-run/route.ts`                                      | Pass the provenance needed for the approved historical correction through benchmark/evaluation normalization. Correct overlays must agree numerically with official rows.                                                                                                                                                         |
| Optional targeted backfill, adapted from the private `backfill-tpuv7-physical-count.ts` | Needed only if the destination DB already contains affected rows. First inventory the target using a read-only connection. Preserve transaction/conflict handling and idempotence; narrow eligibility by source provenance. For a clean import, normalize before insertion instead.                                               |

No schema migration is required merely to recognize this TPU or store physical counts: the existing `num_prefill_gpu` / `num_decode_gpu` columns can retain their names and carry physical accelerator counts. Numeric metadata can use the existing metrics object. If launch requirements require new config identity dimensions beyond the existing physical-count distinction, reassess schema needs explicitly.

Do not use a DB-only backfill as the complete solution: re-ingesting the old artifact or loading it as an unofficial overlay would recreate the bad denominator. Do not divide already-corrected private DB exports again.

### 3. Preserve physical counts and DP through rendering and export

| Current file                                                                                                                             | Change                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/src/components/inference/types.ts`                                                                                         | Represent physical chip count separately from logical TP, and carry numeric DP. Avoid silently redefining the legacy overloaded `InferenceData.tp` field across the application.      |
| `packages/app/src/lib/benchmark-transform.ts`                                                                                            | Preserve aggregate physical counts and `metrics.dp`; compute one physical deployment count from the populated aggregate side, or sum the roles for disaggregated serving.             |
| `packages/app/src/lib/chart-utils.ts`                                                                                                    | Preserve those fields in chart points. Current code clears aggregate `num_prefill_gpu` / `num_decode_gpu` and therefore needs an explicit physical-count field before that narrowing. |
| `packages/app/src/components/inference/utils/parallelism-label.ts` and `utils/tooltipUtils.ts`                                           | Render logical TP and numeric DP separately; use physical count for “Total Chips.” Retain the current DCP/PCP, PP, localization, and aggregate/disaggregated behavior.                |
| `packages/app/src/components/inference/ui/InferenceTable.tsx`, `ui/LegendPointsDialog.tsx`, `packages/app/src/lib/csv-export-helpers.ts` | Expose physical count and DP where relevant; a “TP” column must continue to mean logical TP. Check inference, timeline, and overlay exports.                                          |
| `packages/app/src/components/inference/utils/point-identity.ts`, `benchmark-transform.ts` deduplication, and calculator grouping         | Ensure same-TP/same-concurrency configurations with different physical counts or DP are not accidentally merged. Preserve existing run/date/spec-method identity.                     |

Current metric titles, major tooltips, table labels, and CSV throughput headers already use “Chip” and have Chinese equivalents. Keep these current implementations. The old runtime GPU-to-chip string replacement is unnecessary and would regress localization. `ChartTooltip.tsx`, `FleetPlanner.tsx`, and `useTrendData.ts` from the private diff no longer exist on this branch; do not reintroduce them.

### 4. Decide power and pricing before enabling comparisons

The private registration contains `tdp: 9.99`, `power: 9.99`, and a customer rate of `$1.21/chip/hour` in all three cost tiers. The app also embeds an Internal rate of `$1.03/chip/hour`. These are historical private inputs, not newly verified publication values.

- Obtain release-approved TDP, all-in kW/chip, and the intended cost assumptions, with their provenance and date.
- Do not ship `9.99` as a usable power value. It would produce misleading tok/s/MW, J/token, TDP percentages, and fleet sizing. Either supply verified inputs or explicitly represent missing assumptions and suppress dependent results; replacing it with a numeric zero without availability handling is also insufficient.
- Prefer a single agreed public cost basis for the initial release unless the old Internal/External comparison is specifically wanted. Retain throughput/latency independently from optional economic assumptions.

If Internal/External TCO parity is required, it is a separate cross-cutting change:

1. Put a typed cost-basis resolver beside `getGpuSpecs` in `packages/app/src/lib/constants.ts`; retain the current `tdp` field. Define how it interacts with user-entered costs.
2. Extend current global state, `url-state.ts`, and share/restoration tests with a basis parameter. The route registry already owns `g_` share scopes.
3. Integrate it into `buildDerivedChartFields`, official and overlay processing, `useInterpolatedTrendData.ts`, `useThroughputData.ts`, `CostTargetPanel.tsx`, `FleetLifecycle.tsx`, badges, captions, custom-cost controls, and exports.
4. Cover the new tokens-per-dollar and tokens-per-RMB metrics as well as $/M token. The old overlay patch rescales only nine cost fields and would leave today's default tokens/$ metrics inconsistent. Throughput, latency, physical power and gross token revenue must not change just because the cost basis changes.
5. Define consistent server-rendered compare/overview behavior and cache/query semantics. Keep the throughput-only `tco-feed` methodology intact unless its contract actually changes.
6. Add bilingual controls and analytics. Treat an “Internal” value shipped in browser code as public data; its name does not provide access control.

The current shared spline and reciprocal-metric handling must remain intact. Do not restore the private lightweight interpolation formulas. If interpolation semantics change, update the Python blog helper in the same change as required by the repository.

### 5. Choose an explicit results/provenance publication path

The private fork changes CI repositories, artifact credentials, Vercel URLs, cache invalidation, and public-style API fallback to private repositories. These are private-deployment configuration, not TPU hardware support.

- Keep this checkout's public repository identity, default ingest workflows, cache URLs, authentication, and production environment names.
- Prefer approved results with public, reproducible source links when publication actually happens. If results remain in the private source, choose explicitly which runs/artifacts are approved for exposure and how readers obtain the corresponding provenance.
- For a future isolated local import, the existing admin downloader already accepts an explicit source repository. The local port now infers the repository from a GitHub run URL; an explicit repository argument still takes precedence. Do not run that admin import against the production DB during preparation.
- `createWorkflowRunServices` previously searched the public/legacy `GITHUB_REPOS`, independently of the downloader's selected repository. The port threads the explicit admin source through metadata lookup so private imports retain their actual source URL/date/SHA. Keep that choice separate from the public live-artifact API.
- Do not copy the private fallback into anonymous public endpoints by default. With a private-capable server token, such a fallback could expose other unpublished private runs through a run ID lookup. Local source access or a release allowlist must be deliberate.
- The six cached private commits after its working HEAD add CollectiveX/private-source behavior; include it only if CollectiveX TPU results are part of the requested release.

Mappings must be ready before the first target import. The current code skips unknown TPU rows, as the diagnostic reproduced. If an import occurred earlier, replay the approved sources after normalization is fixed. Actual import, cache invalidation, deployment and publication are later operations, outside this audit.

### 6. Cover the intended public surfaces

- Inference, evaluation, reliability, historical trends, calculator, unofficial overlays, and comparison slugs should resolve the registered hardware. Compare pairs derive from `GPU_KEYS`; adding the key also expands generated comparison URLs and their Chinese siblings.
- `/overview` is an exception: `OVERVIEW_HARDWARE` in `packages/app/src/lib/overview-data.ts` is a curated list of five devices. Add TPU explicitly if the launch requires it in that matrix, and verify reference selectors, narratives, API/cache behavior and tests. Registry insertion alone will not do this.
- GPU Specs is also separate: `packages/app/src/lib/gpu-specs.ts` has its own data list and a vendor union restricted to NVIDIA/AMD. To include TPU there, add verified specs, extend vendor presentation, and model its topology accurately. Do not portray its interconnect as NVSwitch or AMD full mesh. This can be deferred if only measured benchmark results are launching.
- A launch preset/banner, landing/about copy, article, or methodology explanation is optional promotion work. Any such English change needs its Chinese sibling. No new dashboard tab or model registration is required for the reference run.
- Update `api-documentation.ts` and `api-route-catalog.ts` whenever response semantics, parameters, source access, or shared public types change. Document physical-chip units without renaming existing raw API fields solely for typography.

## Regression and release acceptance plan

1. Use the actual run's TP8 and TP1 rows, plus modern artifacts with explicit physical counts. Assert exact counts, DP, and all three throughput values; verify unknown/invalid fields and existing GPU fallbacks.
2. Cover individual and aggregate eval formats, including v2-shaped eval rows with a global physical count. Assert topology, not just hardware recognition.
3. Prove correction idempotence, approved-run scoping, and preservation of latency, concurrency, other hardware and already-corrected exports.
4. Assert identical official/overlay values through chart transformation, cost derivation, calculator input, tooltip, table, and CSV. Include hide/solo/dismiss behavior, zoom and point identity.
5. Verify Google blue versus Teacup purple in light/dark and high-contrast mixed-vendor views. Unofficial overlays must continue to use `overlayRunColor`, not vendor colors.
6. Add English and Chinese browser coverage using faithful fixtures. Check exact numeric behavior, share restoration, and cost-basis changes if included. Update `timings.json` from an observed run if a new integration spec is added.
7. Run unit tests, typecheck, lint, format, typography, API synchronization guards, and the smoke suite. Resolve any existing browser-suite failures before claiming full release validation. Do a local browser check with the approved unofficial run and compare it with the normalized official fixture.

## Audit validation before the port (September 2)

- Audited current/private code and one real historical benchmark run, including the exact producer source and a read-only process-local replay.
- Applied the requested Teacup purple palette change in `packages/constants/src/gpu-keys.ts` and `packages/app/src/lib/chart-utils.ts`.
- Synced local dependencies from the existing frozen lockfile after finding a missing local MDX link; no manifest/lockfile change was needed.
- Typecheck, focused lint/format, and all 5,434 workspace unit tests pass. The focused color/chart suites account for 197 of those tests.
- Browser smoke component tests pass. The integration phase finishes with 103/110 passing and seven failures in untouched evaluation evidence, Chinese blog/submissions, and overview dark-theme accessibility tests. Inference, reliability, CSV overlay, overlay optimal-only, resident-sequence, and sanity specs pass. Full smoke validation is therefore **not green**; these failures were not fixed as part of the TPU audit/color request. Details are in `/private/tmp/inferencex-tpu-audit.mNGVFQ/smoke-tests.log`.
- TPU implementation, DB imports/backfills, commits, pushes, deployments, and publication were not performed.

## Publication inputs remaining after the local port

1. The exact approved release run(s): use the historical run inspected here, newer runs, or both.
2. Release-approved power inputs when available. The user has confirmed that power is still unavailable and requested the Internal/External comparison; the local port now includes it with explicit historical pricing assumptions.
3. Whether the release includes the curated overview matrix, GPU Specs, CollectiveX, and a launch announcement, beyond the core inference/evaluation results.

The core port is implemented locally. These remaining decisions determine which results to import and which optional launch surfaces to publish.

## Local implementation — September 3

The user authorized the port, retained LOCAL ONLY, confirmed there are no updated power values, and requested an improved Internal/External TCO control hidden when TPU is absent.

- **Registration and colors:** TPU7x / Google / Ironwood, unique sort position 11, Google blues, Teacup purples. Vendor quick filters include both vendors. Existing registry-driven comparison and reliability paths resolve the new hardware.
- **Ingest and normalization:** both benchmark and evaluation formats accept explicit physical counts, preserving per-role zero for absent roles. Numeric DP is retained separately from DP attention. The known run `30864013158` receives the source-audited four-chip / TP8-DP1 or TP1-DP8 correction before config identity is computed. Its eval worker fields are normalized to one aggregate engine. Other runs and modern explicit counts are untouched; normalization is idempotent. CI ingestion, GCS replay, and unofficial overlays use the same mappers.
- **Physical topology:** full inference points, historical points, calculator inputs and evaluation rows retain physical count and DP. Default point labels show physical chips; advanced labels keep logical TP and DP. Tooltips, tables and CSV exports distinguish these values. D3 identities and run-scoped replacement keys include physical counts/DP.
- **TCO:** historical external $1.21 and internal $1.03 per chip-hour are explicit assumptions. A shared provider applies them to inference, overlays, trends, calculator and fleet cost consumers. Controls show the rates, have English/Chinese copy and analytics, and appear only with visible TPU data. `g_tco` preserves the selection in share links. Dollar and RMB purchasing-power metrics use the selected basis; the spline algorithm is unchanged.
- **TCO placement:** the pricing control sits at the left of the inference, historical-trend and calculator chart toolbars, with Chart/Table and export actions grouped at the right. It wraps onto separate rows on phones; the historical-pricing/power explanation is available through the shared info popover. Captions retain the active per-chip cost badges without embedding interactive controls.
- **Missing power:** removed the old 9.99 placeholders. Zero is the registry's unavailable sentinel, with dependent throughput/MW and J/token fields omitted, calculator power bars excluded, badge values unavailable, and no zero-TDP structured-data claim. Fleet sizing retains its existing unavailable-power behavior.
- **Source isolation:** admin ingest now infers the repository from an explicit GitHub run URL and uses that source for metadata enrichment. The production unofficial API still reads only the public source. A development/loopback-only, explicit local-file opt-in previews the downloaded run without a DB write or private-repository API fallback.
- **Documentation:** public API English/Chinese explanations and OpenAPI descriptions document physical-chip units while preserving legacy field names. The route catalog records the local preview restriction. `.env.example` documents the development-only file source.
- **Tests:** sanitized real run measurements are fixtures. Regression tests cover exact throughput/counts, both eval formats, idempotence, invalid/modern counts, official/overlay parity, pricing across full and lightweight consumers, CSV columns and production preview isolation. Cypress verifies live pricing changes, physical counts/DP, run dismissal and Chinese share-link restoration.

### Local preview

Server: `http://localhost:3000`.

Open `/inference?unofficialrun=30864013158&g_model=Qwen-3.5-397B-A17B&i_seq=8k%2F1k&i_prec=fp8`. Explicit scenario/precision avoid the dashboard's newer Agentic/FP4 defaults. The run contains six benchmark and three evaluation rows. `packages/app/.env.development.local` (ignored) points at `/private/tmp/inferencex-tpu-audit.mNGVFQ`, containing `<runId>.json` plus the downloaded originals. If that temporary directory is removed, restore downloaded artifacts there or choose a new local directory.

### Scope kept for publication decisions

- No DB import/backfill, remote push, deployment, cache invalidation or publication has been performed. A clean import can use the prepared mappers; an existing contaminated destination needs an inventory before choosing a targeted repair.
- The curated Overview matrix, the separate GPU Specs dataset, CollectiveX source changes, and a launch article/banner are tracked separately. GPU Specs needs verified TPU specifications/topology; the current scope is measured inference/evaluation results. No fabricated spec entry or private deployment/CI configuration was copied.
- Public reproducibility links still need the approved release source. Local preview links intentionally reference the private historical run; they are not a release approval.

### Final verification

- TypeScript, lint, typography, and formatting of all changed port files pass. All **5,442 workspace unit tests pass** (app 4,755; constants 47; DB 615; MCP 25).
- The dedicated TPU browser spec passes **2/2**. Browser inspection also confirmed the calculator restores the internal basis, shows `$1.03/hr`, excludes TPU from power-efficiency bars, and hides its TCO control there.
- Smoke components pass **41/41**, including the clipped-point regression initially caught and fixed during the port. The full integration run was **101/110**; a settled-server rerun of evaluation improved **21/24 to 23/24**, resolving two transient SVG/caption failures. The remaining seven failures match the pre-port audit: unofficial eval evidence, three Chinese blog/submission checks, and three Overview dark-theme contrast checks. The full smoke suite is still not green.
- Repository-wide formatting reports 25 pre-existing untracked audit artifacts outside this port; they were preserved. Changed port files and this document pass formatting.
- Logs: `/private/tmp/inferencex-tpu-port-unit.log`, `/private/tmp/inferencex-tpu-port-smoke.log`, `/private/tmp/inferencex-tpu-eval-final.log`, and `/private/tmp/inferencex-tpu-format.log`.

The September 3 toolbar-placement follow-up passes typecheck, lint, typography, changed-file formatting, all 5,442 unit tests, and the dedicated TPU spec at a 375px viewport (2/2). Manual checks confirm the info popover and responsive toolbar placement. Smoke components pass 41/41 and integration passes 105/110; the five remaining failures are the previously recorded unofficial evaluation evidence check, Chinese submissions workflow, and three Overview dark-theme contrast checks. Logs are `/private/tmp/inferencex-tco-layout-{unit,smoke,tpu,typecheck}.log`.

### Additional review findings — excluded from the requested port

The user declined these additional improvements. They are retained only as review history, not as planned work or new acceptance requirements for this port. The review did not change application behavior.

1. **Calculator table and CSV omit unofficial TPU results.** The plot uses `barResults` (official + overlay), but `CalculatorTable` and `handleExportCsv` receive only `results`. Browser reproduction: the Qwen 8K/1K preview displays the TPU overlay in Chart mode, while searching the calculator table for `TPU` yields zero results. Use one visibility-filtered result set across all views, preserving run labels/URLs and clamped operating-point status in the table and CSV.
2. **Unavailable TPU power still becomes zero outside the power plot.** `buildGpuGroups` sets all three throughput/MW fields to `0` when power is missing. The power chart excludes these results, but the calculator tooltip and CSV emit `tok/s/MW: 0`; the table formatter does the same for official TPU rows. Propagate unavailable values through interpolation and render a dash/explanation in UI and blank CSV fields. No new power estimate is needed.
3. **Ambiguous physical counts need an ingestion guard.** The verified six-row fixture is corrected properly. A synthetic variant of its TP1 row with `num_gpus: null` bypasses the run-specific normalizer, however, and the mapper accepts one chip and 29,398.7346 tok/s/chip instead of the verified four chips and 3,674.8418 tok/s/chip. The same legacy-shaped input under an unrecognized run also falls back to TP × EP. Require valid explicit TPU chip counts or an audited legacy correction; report ambiguous rows rather than guessing. This is a reproduced edge case, not a claim that another real run has the same topology.
4. **Calculator tooltips drop physical chip count and DP.** The nearest point retains `physicalChips: 4` and `dp: 8`, but the tooltip prints only `TP: 1`. Show physical chips separately from logical TP/DP for official and overlay results; distinguish the two bounding configurations when interpolation spans different topologies.
5. **Make pricing provenance explicit.** CSV outputs carry derived cost numbers without the selected internal/external basis, hourly rate, or assumption source/date. Include those inputs so published exports remain reproducible. Gate the pricing switch by whether the current view uses pricing as well as TPU visibility, and explain the two basis names before choosing clearer public wording.

The focused reproduction script is `/private/tmp/inferencex-tpu-review-check.ts`. Public release-source links and the missing power/spec inputs remain the separate publication decisions above.

- Branch remains `local/work-2026-09-02`, with `pushRemote=/dev/null`. No commits, pushes, DB writes, or publication operations were performed during the port.

### September 8 mainline merge

Merged `origin/master` at `45513464` into the local branch. Mainline now supplies public TPUv7 results, launch content, a global TCO basis, and TPU assumptions of 980 W TDP / 1.207 kW all-in power. Those values supersede the missing-power notes above. The merge uses the mainline global pricing state and its updated rental rates, retaining the local toolbar placement, Teacup purple, physical-chip/DP fields, and historical artifact normalization. Physical-chip fields follow mainline's TP × PP floor for legacy GPU counts and its explicit-count exception for TPU logical cores. The duplicate DP suffix and duplicate pricing providers are removed. No remote push, database write, or deployment is part of this merge.

Validation: 6,103 workspace unit tests pass (app 5,041; constants 53; DB 689; MCP 25; CLI 295). Smoke components pass 46/46; integration passes 108/113 with the same five previously recorded failures. Navigation passes 16/16, and the TPU publication spec passes 2/2 at 375px, including keeping the switch after overlay dismissal while official TPU data remains visible and hiding it after that hardware is hidden too. TypeScript, lint, typography, and changed-file formatting pass. The local historical preview fixture was restored from the committed raw fixture and run metadata after the temporary copy had disappeared. Logs: `/private/tmp/inferencex-0908-{unit,app-unit-final,smoke-final,tpu-navigation,tpu-final,typecheck}.log`.
