# Frontend, public API and skills parity audit

Audit baseline: `master` at `ac021df7ad6b4b8e5ef8a9139bafbc5ef63e82fc`.
Scope is public read-only data and numerical controls, including hidden navigation,
off-dashboard dataset pages, point details and sample drawers. This is a source
audit with regression tests, not a claim of production database equivalence.

The baseline had 21 dashboard view operations. Route registration covered the
dashboard families but did not prove control-level parity. This patch adds four
view operations and extends two existing ones; it does not merge, deploy, or
publish a new npm version.

## Gaps found and implemented

| Frontend feature                                          | Baseline gap                                                                                                                                                                 | Implementation and important semantics                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dataset summary/distributions and conversation flamegraph | Public raw datasets, search/sort/pagination and nested conversation structure existed. No page projection, shared expanded-row/overlap computation, or visualization recipe. | `views/dataset`: stored chart data, paginated conversation index, one optional conversation; `expanded`, `raw`, `inner`, `turn`, `sa`; shared visible rows, braces, resolved target and separate request/group token scales. Dataset-wide distributions are unaffected by index search. |
| `/inference/agentic` telemetry catalog                    | Server-rendered catalog had no public operation for its grouping and representative configuration cards.                                                                     | `views/agentx-catalog` calls the page's `getAgenticCatalogGroups`; reports card and stored-point counts without fetching each trace.                                                                                                                                                    |
| AgentX point phase/source controls                        | Public raw timeline/server metrics existed, but compact request decoding, warmup/profiling slicing and lazy metric-source arrays were page-owned.                            | `views/agentx-point`: one available result, `phase` and `source`, shared decoder/phase helpers, original origins, nullable server data. Microsecond quantization matches the UI; exact timestamps still require raw timeline.                                                           |
| Evaluation sample drawer                                  | Publicly reachable UI readers were explicitly excluded from the published contract; no supported drawer recipe for stored/live identity, pass filter, page or doc deep-link. | `views/evaluation-samples`: documented fixed-source projection, strict selectors, `docId=0`, page-only text search, pre-search totals and explicit source; no-store. UI and API now share search logic.                                                                                 |
| GPU-spec radar chip visibility and normalization          | Raw hardware values and ranking existed; no selected-chip control or normalized radar projection.                                                                            | `views/gpu-specs`: `chips`, all-registry normalization before visibility filtering, null preservation; UI and API share normalization. CSV retains raw values.                                                                                                                          |
| Overview configuration-specific inference drilldown       | Frontend share links carried current/baseline config keys that the inference view could not apply.                                                                           | `views/inference`: `currentConfig`, `baselineConfig`, existing `filterOverviewHistoryRows` before chart projection and on unofficial overlays; baseline requires comparison selection.                                                                                                  |

## Controls already covered at baseline

The exact accepted-key table remains in [dashboard-readonly-views.md](dashboard-readonly-views.md).
The table below records the control families reviewed, not every possible value
combination. Source paths are relative to `packages/app/src`.

| Frontend/source family                              | Existing API data and controls                                                                                                                                                                                                                                        | Rendering/derived boundary                                                                                                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/inference`, global/date/filter contexts | `views/inference`: model, sequence, precision, snapshot/date/exact run; GPU/vendor/framework/deployment/spec/power; x/y metrics, percentile, frontier/best/all points; pricing/TCO/custom costs and powers; comparison dates; public unofficial overlays.             | Axis scale, gradients, labels, line visibility and emphasis are renderer state. Legend hiding happens after selection; it is not equivalent to filtering candidate GPUs before winner selection. Raw Pareto membership already has a public operation. |
| `components/trends`                                 | `views/historical`: model/sequence, target, metric, precision/hardware/framework/vendor/deployment; inclusive observation start/end, pricing/TCO and labeled line extension.                                                                                          | Zoom and line styling do not change observations.                                                                                                                                                                                                      |
| `components/calculator`                             | `calculator`, `first-token`, `cache-reuse`, `profit-estimator`, `profit-estimator-per-gigawatt`, `fleet`: targets, token/cost basis, MW, caps, config, TTFT, minimum interactivity, list/custom prices, utilization/lab share, power basis and lifecycle assumptions. | Calculator bar metric chooses among returned throughput/power/cost values. Fleet price seeding is an input-edit convenience; explicit resulting prices are supported. Rulers/comparison annotations are local derived displays.                        |
| `components/evaluation`, reliability                | `views/evaluation`: model/task/date/precision/GPUs/unofficial rows. `views/reliability`: range/as-of/GPUs and counts/rates.                                                                                                                                           | Percent versus count display chooses an existing returned field. Sample drilldown was the separate gap above.                                                                                                                                          |
| OperatorX                                           | `views/operatorx`: run/operator/precision/shape/backend/cluster/status, metric and table page.                                                                                                                                                                        | Expanded rows and chart styling use returned sweep data.                                                                                                                                                                                               |
| CollectiveX                                         | `views/collectivex`: ordered runs, suite, EP size/phase/modes/precision/operation/percentile/axes/SKU/backend/active series; KV page size/op/axes/overlap/series; swap direction/layout/metric/percentile/series.                                                     | Visibility and fits use the same shared plot helpers.                                                                                                                                                                                                  |
| Overview, model/chip rankings and pair comparisons  | `overview`, `rankings`, `compare`: row limits, models, tier/engine/reference/comparison, scenario/kind, pair/variant selection.                                                                                                                                       | Per-config drilldown is added above. Locale and page layout are not separate numerical views.                                                                                                                                                          |
| Submissions                                         | `views/submissions`: table search/sort/direction/offset/limit; weekly/cumulative, on-change-only and enabled chart lines.                                                                                                                                             | Table search intentionally does not filter the independent submission-volume chart. Expanded row UI is presentation.                                                                                                                                   |
| Current InferenceX images                           | `views/current-inferencex-image`: model/sequence/hardware/precision/speculation/node/framework and as-of.                                                                                                                                                             | Image age labels derive from returned dates and explicit as-of.                                                                                                                                                                                        |
| GPU sensor metrics                                  | `views/gpu-metrics`: run/artifact/GPU indices/metric, time-series vs correlation, correlation axes, sort/direction and downsampling preference.                                                                                                                       | Raw rows and statistics remain unsampled; interactive chart downsampling is not loss of source evidence.                                                                                                                                               |
| Video benchmarks                                    | `views/video`: run/artifact discovery and already-published bundle reads, source/cell/compare, media slot, phase/GPU denominator, workload/axes/costs/selected tradeoff.                                                                                              | Playback, media layout and local what-if annotations are renderer state. Local builder uploads and publication are not public reads.                                                                                                                   |
| Dataset listing                                     | `/api/v1/datasets` and `inferencex discover datasets` already expose ingested registry entries.                                                                                                                                                                       | Metadata does not prove association with any measured result.                                                                                                                                                                                          |
| AgentX summaries/provenance                         | Existing availability, aggregates, derived metrics, histograms, raw timeline/server metrics, siblings and bounded logs. Formal `agentx export` and `result inspect` retain their contracts.                                                                           | Catalog and phase/source projections supplement rather than replace these operations.                                                                                                                                                                  |
| AI charts, localized routes and embeds              | Underlying public benchmark calculations use the same inference views; localized routes and embeds do not define separate numerical populations.                                                                                                                      | Private prompts, provider credentials, generated local assets and visual layout are not new public datasets.                                                                                                                                           |

## Coverage guard and skills changes

The point projection also covers local numerical controls omitted by a
route-only audit: P75/P90 request percentiles, TTFT/E2E latency, input/decode
throughput selection, sequence distribution/in-flight views and
queue/completed-request views. Its `charts` payload uses the existing
`time-series-math` and `lognormal` helpers and records windows/units.
The raw Gantt timeline's conversation/worker grouping, expanded rows and
zoom/cursor state are layout over the already-public source-rich timeline;
sibling sorting and bounded log text search likewise remain client-side.

`lib/views-api/control-coverage.ts` maps every `UrlStateKey` to a view parameter,
returned-value derivation or rendering-only explanation. Its test compares the
map with `PARAM_DEFAULTS` and validates referenced query keys. This is a persisted
control guard, not a parser for arbitrary frontend URLs and not proof that every
transient React state variable is tested. The table above records transient and
off-dashboard controls separately.

The existing `@semianalysisai/inferencex-skills` package gains a frontend-drilldown
recipe and routing links, including dataset histogram/flamegraph rendering rules,
phase/source units, evaluation page-local search and radar denominator semantics.
The formal CLI still has six evidence workflows. Public view captures use its
existing capture recipe; they are not silently promoted to verified bundles.
Packed-install tests check that Codex and Claude receive the recipe.

## Deliberate exclusions and remaining verification

- No private uploads, arbitrary artifact URLs, provider keys, feedback, administrative
  writes, ingestion or publication actions are exposed.
- No automatic bulk trace/conversation hydration. Catalog/index discovery is cheap;
  expensive point/structure reads require one explicit selection.
- No new SVG/HTML rendering service or pixel-for-pixel screenshot API. The skill
  describes rendering the returned data; presentation state stays with the renderer.
- No npm publish or deployment. Skills must check the deployed OpenAPI contract
  before calling the new operations; installed files alone do not establish support.
- Unit tests compare shared helper outputs and representative selectors, including
  encoded identities, missing data, invalid controls, source failures and page
  semantics. They do not exhaust the Cartesian product, prove historical source
  completeness, or replace live UI/API checks against production after deployment.
- Chinese API descriptions are included and manually reviewed here. A separate
  native-speaker review remains appropriate before release.

## 中文说明

本次审查基于上述 master 提交，逐项核对公开前端的数据、筛选项和详情页面，
而不是仅检查路由是否登记。原有 21 个仪表板视图已覆盖主要筛选项；本次新增
4 个只读视图，并扩展 GPU 规格和 inference 两个接口。

补齐的内容包括数据集分布与火焰图投影、AgentX 遥测目录、阶段及指标来源选择、
评估样本详情、雷达图归一化，以及当前与基线的精确配置筛选。接口复用前端计算
函数，保留缺失值、数据来源、时间原点和分页含义。数据集搜索不改变全局分布，
评估文本搜索仅作用于当前页，隐藏芯片不会改变雷达图的归一化分母。

现有 skills 包增加相关操作与可视化说明，没有新增正式证据工作流。私有数据、
写入操作和展示样式不纳入公开读取范围。本次不发布 npm 包或部署服务；部署后
仍需进行生产环境的 UI/API 对照验证，单元测试不能替代该步骤。
