# OperatorX

OperatorX is available directly in primary dashboard navigation without an unlock.
CollectiveX remains in **Hidden**. `/operatorx` and `/zh/operatorx` share the
same reader, chart, filters, and coverage.

The view compares single-GPU GEMM and routed MoE operator timings on NVIDIA and AMD. The
reader matches every requested case/backend against the stored shards, and ingest keeps each
shard's newest attempt, so partial reruns retain earlier shards. Rows are separated into
measured, unsupported, failed, and missing. Zero-size GEMMs have no throughput value.

Cross-run comparisons select the newest available result per GPU, case, and backend.
An explicit error or unsupported result remains visible; a missing result can be
filled by an older stored run. Kernel timelines are read from the result's stored
run, so opening a profile still works after a newer comparison replaces that row.
Timeline references include the stored revision. Re-ingesting the same run replaces
that revision, so a new comparison cannot open a cached timeline from the old data.

TFLOPS is derived by the shared comparison transform as useful FLOPs (`usefulFlops()` in
`packages/db/src/operatorx/describe.ts`, `2*M*N*K` for GEMM) divided by
`latency_us*1e6`, per GPU. An eight-GPU Slurm allocation does not multiply this number.
Charts plot only successful measurements. The coverage strip counts the other cases per GPU.

### Distribution normalization

The Distribution per GPU chart can show raw TFLOPS or TB/s, or normalize those
values by the documented peak for each hardware and case precision. Normalized
throughput is achieved TFLOPS divided by peak TFLOPS; normalized bandwidth is
achieved TB/s divided by peak TB/s. The axis and box tooltips show percentages.
Cases without a peak for their precision are excluded from normalized boxes;
values above 100% are retained. Matched only is recalculated after normalization
so every displayed box uses the same eligible case set. Latency has no peak
percentage, and already normalized metric choices keep their existing units.
The Normalized switch is offered for raw throughput and bandwidth metrics.
Ascend 950PR bandwidth normalization uses the documented, assumed 1.6 TB/s basis.

The page-owned `GET /api/v1/operatorx/compare` route accepts optional
`distributionMetric`, `distributionNormalized`, `distributionMatchedOnly`, and
`distributionHardware` query parameters. If any is present, it returns a
`distribution` projection with resolved controls, per-GPU quantiles, counts, and
case indices. The same pure helper produces the chart boxes and API projection;
the existing comparison response is unchanged when those parameters are absent.
The response's measurement columns retain statuses and source run/result identities.
OperatorX remains a page-owned API outside the published OpenAPI document.

| Distribution control | API parameter             | Returned data effect                                   |
| -------------------- | ------------------------- | ------------------------------------------------------ |
| GEMM/MoE tab         | `op`                      | Selects the operation                                  |
| Workload             | `workload`                | Selects cases before distribution                      |
| Metric               | `distributionMetric`      | Selects the value and peak basis                       |
| GPU legend toggles   | `distributionHardware`    | Selects distribution columns and matched cohort        |
| Matched only         | `distributionMatchedOnly` | Uses cases eligible on every selected GPU              |
| Normalized           | `distributionNormalized`  | Divides throughput or bandwidth by the applicable peak |

Box hover and expansion change presentation only; they retain these results.

中文：Distribution per GPU 可将实测 TFLOPS 除以对应硬件和精度的计算峰值，或将实测
TB/s 除以带宽峰值；纵轴与箱线图提示均显示峰值占比。缺少对应精度峰值的用例不计入归一化
统计，超过 100% 的实测值不会截断。“仅显示匹配用例”会按归一化后的有效数据重新
选取共同用例。归一化开关仅用于原始吞吐量和带宽指标；延迟没有对应的峰值百分比，
已是峰值占比的指标保持原有单位。
950PR 的带宽归一化使用文档中假定的 1.6 TB/s 参考值。
页面专属 `/api/v1/operatorx/compare` 接口通过上述四个 `distribution*` 参数返回
筛选后的分布统计，并保留原始测量状态和 run/result 来源；未传这些参数时，响应保持不变。

## Compact comparison reads

Ingestion normalizes each run once and stores versioned per-run GEMM and MoE
comparisons in `opx_run_comparisons`, in the same transaction as the raw documents.
These projections contain timing rows and source identities, without profiling
payloads. `/api/v1/operatorx/compare` reads them directly and merges newest-first;
it no longer fetches and normalizes raw artifacts for a backfilled run. The API
response, selectors, calculations, missing/error handling, and timeline references
are identical to the legacy reader. Raw artifacts still serve run details and
kernel timelines on demand.

The projection is keyed by the database run revision and operator. Re-ingesting
replaces its raw documents and compact projections atomically; deletion cascades
to projections. `OPERATORX_COMPARISON_VERSION` must be bumped when the persisted
projection or its derivation changes. A missing table, missing projection, or old
format uses the raw reader with revision-keyed in-process normalization reuse.
Permission, network, and other storage errors remain failures; a partial comparison
is not cached. Local-directory sources keep the raw path.

### Bulk compact reads

One SQL query loads the listed run revisions; merging keeps newest-first order.
Missing/stale projections alone use bounded raw fallback; only a missing table
suppresses a SQL error. Responses and timeline identities are preserved.

中文：一次 SQL 查询读取所列 revision，按最新优先合并；仅缺失或过期的记录回退至原始数据，
仅缺表错误可触发整体回退。响应和时间线标识保持一致。

### Rollout and backfill

1. Apply the migration: `bun run admin:db:migrate:operatorx -- --yes`.
2. Give the role used by `DATABASE_OPERATORX_READONLY_URL` SELECT access to
   `opx_run_comparisons` if owner default privileges do not already cover new tables.
3. Preview existing runs: `bun run admin:db:backfill:operatorx-comparisons -- --all`.
4. Populate compact data: `bun run admin:db:backfill:operatorx-comparisons -- --all --yes`.
5. Deploy the reader and purge `/api/v1/invalidate?scope=operatorx`; warm
   `/api/v1/operatorx/compare?op=gemm` and `?op=moe` by consuming their full responses.

The backfill requires `DATABASE_OPERATORX_WRITE_URL`; it loads one run at a time,
preserves run revisions and source indices, and locks the captured revision before
writing. A concurrent re-ingest causes stale work to be skipped. It is idempotent
and exits nonzero if a run fails. Ingest workflows now warm both default comparisons
after invalidating their cache. No administrator credentials or mutation endpoint
are added to the public API.

### Benchmarking

The reproducible benchmark at `packages/app/scripts/benchmark-operatorx.ts`
compares raw/normalized reconstruction, compact per-run projections, and a
precomputed view snapshot, checking full response parity before timing. Run it with
the input flags shown by `--help`; captured normalized inputs exclude raw SQL and
normalization costs and must not be reported as an end-to-end production speedup.

中文：写入流程在同一事务中保存原始产物和按运行版本生成的 GEMM、MoE 对比数据。
对比接口优先读取不含 profiling 数据的精简记录，再按最新结果优先的规则合并，保留原有
筛选条件、计算、失败状态和时间线来源。缺少表、缺少精简记录或格式版本过旧时，使用原始
读取路径；权限、网络等错误不会被静默忽略，部分读取失败的响应也不会缓存。
迁移后需确保只读角色能读取新表，再使用上述 backfill 命令补齐历史运行；backfill 保留
原始 revision 和 result index，并在写入前锁定对应 revision，避免与重新写入的运行混用。
写入流程在清除缓存后预热默认 GEMM 和 MoE 对比。基准测试会先校验响应完全一致；
仅使用已归一化输入的本地结果不代表完整生产请求的性能。

## Median and best throughput bars

The Median and best throughput panel replaces Distribution per GPU and sits beside Head to head on desktop. Metric vs size is the last chart. Its horizontal bars show median throughput as a fill and the
best measured throughput as an outline, sorted by the displayed median. They follow
the selected workload, hardware, precision and Normalized switch. Normalized bars
show a fraction of each accelerator's peak; absolute bars show TFLOPS.

**Shared cases only** is on by default: every bar uses the exact same cases, measured on every selected accelerator in the selected precision, with arithmetic intensity at or above every selected accelerator's ridge point (peak TFLOPS / bandwidth TB/s). An empty intersection stays empty; for example, FP8 cases measured only with fp32 block scales and only with ue8m0 block scales never overlap.

Turning the switch off gives each accelerator its own successful positive finite measurements at or above its own ridge point. Each bar shows its case count. Case sets and quantization formats may differ; these medians are descriptive, not matched-shape speedup comparisons. Hardware lacking measurements or references is omitted without hiding other hardware. Even-sized cohorts average the middle two values. Best is maximum case throughput, not the fastest timing sample. Clicking opens the best case's timeline.

The page-owned comparison API accepts `rooflinePrecision=bf16|fp8|fp4`, `rooflineHardware=<comma-separated hardware keys>`, `rooflineNormalized=true|false`, and `rooflineSharedOnly=true|false`. Supplying any adds `rooflineSummary`, using the UI's pure helper. Defaults are workload precision, all hardware, normalized=true, sharedOnly=true. `cohort` is `per-hardware-compute-bound` or `shared-compute-bound`. `matchedCases` always counts shared cases before ridge filtering. `caseIndices` is the union of displayed bar indices; each bar also returns its own exact `caseIndices` and `n`. Other fields include `missingReferences`, `hardware`, `median`, `best`, `medianTflops`, `bestTflops`, and `bestCaseIndex`. Normalized values are fractions (1 = 100%); explicit TFLOPS fields remain absolute. Invalid selectors return 400. Without selectors the existing comparison response is unchanged.

中文：“仅共同用例”默认开启：所有柱使用完全相同的用例，即在所选精度下每个所选加速器都有实测值，且算术强度不低于每个所选加速器的 roofline 拐点（峰值 TFLOPS / 带宽 TB/s）。没有交集时仍显示空状态；例如，只用 fp32 block scale 测量的 FP8 用例与只用 ue8m0 block scale 测量的用例不会重叠。

关闭该开关后，各加速器使用所选精度下各自成功、为正且有限的实测值，并按自身的 roofline 拐点筛选计算受限用例。每条柱显示用例数量。用例集合和量化格式可能不同，中位数用于描述各自结果，不代表相同形状下的性能对比。缺少实测值或参考值的硬件不显示，但不会阻止其他硬件显示。用例数为偶数时，中位数取中间两项的平均值；最佳值是用例吞吐量的最大值，不是单次最快计时。点击可查看最佳用例的时间线。

页面专属的对比 API 支持 `rooflinePrecision=bf16|fp8|fp4`、`rooflineHardware=<逗号分隔的硬件 key>`、`rooflineNormalized=true|false` 和 `rooflineSharedOnly=true|false`。传入任一参数时，响应会增加 `rooflineSummary`，与 UI 共用同一个纯函数计算。默认值为工作负载的 roofline 精度、返回的全部硬件、`normalized=true` 和 `sharedOnly=true`。`cohort` 为 `per-hardware-compute-bound` 或 `shared-compute-bound`。`matchedCases` 始终表示拐点过滤前的共同用例数；顶层 `caseIndices` 是所显示各柱用例的并集，每条柱另外返回自身的 `caseIndices` 和 `n`。其他字段包括 `missingReferences`、`hardware`、`median`、`best`、`medianTflops`、`bestTflops` 和 `bestCaseIndex`。归一化数值为比例（1 表示 100%），显式的 TFLOPS 字段始终为绝对值。无效参数返回 400；不传这些参数时，原有响应保持不变。

## Per-device FLOPs and bytes for sharded cases

A case with `parallel` runs on `tp × dp` devices of one node. Following InferenceX
`operatorx/core/parallel.py`, its args keep the full unsplit shape and each dp group's
batch, so MoE experts see `tokens × dp` tokens in total. Each case's `flops` and `bytes`
(the useful-FLOP and ideal-DRAM-byte counts behind TFLOPS, bandwidth, utilization,
roofline points and the median/best bars) are the node totals divided by `tp × dp`, which
pairs one device's share with the measured latency. Arithmetic intensity does not depend
on the device count. Cases without `parallel` are unchanged. A malformed `parallel` value
gives null counts, so the case shows its latency but no derived throughput. Before
comparison format 2, sharded cases were credited with the whole node's work, which put
them above the roofline (up to 3.4× the B300 bandwidth roof for DeepSeek-V4.1-Flash EP8/TP8).

MoE weight bytes count the experts the tokens actually reach, following the forced
`routing.distribution` in InferenceX `operatorx/runners/common/vllm/moe.py`: `balanced` touches
`min(E, T × k)` experts; `single_hot` touches expert 0 plus `k − 1` uniform picks from the rest; a
zipf distribution (`p ∝ 1/rank^s`, k drawn without replacement) uses Rosén's inclusion-probability
approximation, which stays within 2% of simulation and errs high. `natural` routing is the router's
own choice and keeps the uniform-random estimate, so a few low-token sharded `natural` cases can
still sit slightly (≤7%) above the roof when the router concentrates tokens. Before format 2,
skewed routing used the uniform estimate too (Qwen3.5 zipf s=1.2 on H100 reached 1.09× the roof).

中文：MoE 权重字节数按 token 实际路由到的 expert 计算，与 InferenceX
`operatorx/runners/common/vllm/moe.py` 中强制指定的 `routing.distribution` 一致：`balanced`
覆盖 `min(E, T × k)` 个 expert；`single_hot` 覆盖 expert 0，以及从其余 expert 中均匀选出的
`k − 1` 个；zipf 分布（`p ∝ 1/rank^s`，每个 token 无放回地选取 k 个）采用 Rosén 近似计算入选概率，
与模拟结果的偏差不超过 2%，且只会偏高。`natural` 路由由 router 自行选择，仍沿用均匀随机估计，
因此少量低 token 数的切分 `natural` 用例在 router 集中路由时仍可能略高于 roofline（不超过 7%）。
对比格式 2 之前，偏斜路由同样使用均匀估计（Qwen3.5 zipf s=1.2 在 H100 上达到 roofline 的 1.09 倍）。

## Case labels and Metric vs size slices

Case `shape` labels name everything that separates otherwise equal shapes: a split case
appends its `parallel` axes (` · tp=8 ep=8`, in tp, dp, ep, dcp order) and a MoE case whose
router does not pick top-k experts appends its selection kind (` · hash routing`). Metric vs size
slices are the shape without the token count (MoE) or `N`/`K` plus any split (GEMM), followed by
the precision label, so every point on a line is the same operation at a different size. Before
comparison format 3, sharded and hash-routed DeepSeek-V4 and V4.1-Flash, MiniMax-M3 and Kimi-K3
MoE cases shared a line with single-device top-k cases of the same shape (up to 10 cases at one
token count). Router gate weights are counted at their stored `router.gate.dtype` width.

中文：用例的 `shape` 标签会标出区分同形状用例的全部差异：切分用例追加其 `parallel` 维度
（如 ` · tp=8 ep=8`，按 tp、dp、ep、dcp 顺序），router 不按 top-k 选择 expert 的 MoE 用例追加
其选择方式（如 ` · hash routing`）。Metric vs size 的分组键为去掉 token 数的形状（MoE），或 `N`、`K`
加上切分方式（GEMM），再加精度标签，因此同一条曲线上的点是同一个操作在不同规模下的结果。
对比格式 3 之前，DeepSeek-V4、V4.1-Flash、MiniMax-M3 和 Kimi-K3 中切分或 hash 路由的 MoE 用例，
会与同形状的单设备 top-k 用例画在同一条曲线上（同一 token 数下最多 10 个用例）。router gate
权重按 `router.gate.dtype` 的实际存储宽度计算字节数。

## Default MoE workload

When `workload` is absent or names no available workload (for example `workload=moe`), the MoE
view opens on `moe:DeepSeek-V4.1-Flash` (`DEFAULT_WORKLOADS` in
`packages/db/src/operatorx/compare.ts`). If that workload has no data, it falls back to the first
listed workload (most hardware, then label). GEMM keeps the first listed workload. An explicit
valid `workload` always wins.

中文：未传 `workload` 或其值不对应任何可用工作负载（例如 `workload=moe`）时，MoE 视图默认打开
`moe:DeepSeek-V4.1-Flash`（见 `packages/db/src/operatorx/compare.ts` 中的 `DEFAULT_WORKLOADS`）。
该工作负载没有数据时，回退到列表中的第一项（按硬件数量、再按名称排序）。GEMM 仍使用列表第一项。
显式传入的有效 `workload` 始终优先。

中文：带 `parallel` 的用例在单节点的 `tp × dp` 个设备上运行。按照 InferenceX
`operatorx/core/parallel.py` 的约定，参数保留未切分的完整形状和每个 dp 组的 batch，因此 MoE
expert 共处理 `tokens × dp` 个 token。每个用例的 `flops`（有效 FLOP 数）和 `bytes`（理想 DRAM
字节数）取节点总量除以 `tp × dp`，即单个设备承担的份额，与实测延迟相对应。TFLOPS、带宽、利用率、
roofline 数据点以及中位数/最佳值柱状图都由这两个计数推导。算术强度不受设备数影响；不带 `parallel` 的用例保持不变。
`parallel` 取值无效时计数为 null，只显示延迟，不计算派生吞吐量。对比格式 2 之前，切分用例按整个节点的
工作量计算，导致数据点高于 roofline（DeepSeek-V4.1-Flash EP8/TP8 在 B300 上最高达到带宽上限的 3.4 倍）。

## Ascend 950PR normalization

The OperatorX-only hardware reference for `ascend950pr` uses the 28-Cube
Ascend950PR_9579 basis in `Ascend-ubench.md` (hardware configuration and section 5):
378 dense BF16 TFLOPS, 756 dense FP8 TFLOPS and **assumed** HBM bandwidth of 1.6 TB/s.
The compute values are Cube-only ([Huawei Ascend 950 white paper, table 3-1](https://public-download.obs.cn-east-2.myhuaweicloud.com/ascend/%E6%98%87%E8%85%BE950%20NPU%E6%9E%B6%E6%9E%84%E7%99%BD%E7%9A%AE%E4%B9%A6.pdf)),
excluding Vector compute in the combined figures. Exact memory/ECC configuration
remains unresolved; the API reference's `qualification` field records this caveat,
which the charts do not repeat. FP4 remains null.
The normalized roofline divides arithmetic intensity by 236.25 FLOP/byte for BF16
or 472.5 for FP8, and throughput by 378 or 756 TFLOPS respectively. Raw measurements
and the inclusion of activation quantization in measured FP8 latency are unchanged.

`GET /api/v1/operatorx/compare?op=gemm` includes an optional `hardware[].reference`
object with `label`, nullable `peakTflops.{bf16,fp8,fp4}`, `memoryBandwidthTBs`,
`memoryBandwidthAssumed`, `source`, and `qualification`. UI helpers and the
page-owned API use the same reference. This endpoint remains a `page-bff`, outside
the published OpenAPI contract. Unknown hardware gets no reference. Ascend uses a
cool crimson in light/dark charts, distinct from AMD's warm reds; color is a
presentation-only control with no numerical API effect.

### Initial chart selections

The display label is `950PR` (the stored hardware key remains `ascend950pr`).
The comparison API returns `defaults.metricVsSizeSlice`, `defaults.rooflinePrecision`,
and `defaults.rooflineNormalized`, resolved for the selected workload by the same
pure helper the UI uses. Metric vs size prefers the highest-ranked slice with
successful, positive finite 950PR latency at two or more distinct positive sizes;
otherwise it keeps the existing largest-slice fallback. Missing, failed and
unsupported rows cannot qualify a slice. Roofline starts with BF16 when FLOP/byte
counts exist, otherwise the most represented supported precision, and starts with
Normalized enabled. Explicit shape/precision choices and normalization toggles
still win; no data, hardware selection, or measurement is changed.

### 中文说明

`ascend950pr` 的参考值仅用于 OperatorX，依据 `Ascend-ubench.md` 的硬件配置说明和第 5 节，
以 28 个 Cube 核的 Ascend950PR_9579 为基准：BF16 和 FP8 的稠密计算峰值分别为 378 和
756 TFLOPS，HBM 带宽**假定为** 1.6 TB/s。计算峰值仅计入 Cube 算力，来源为
[华为 Ascend 950 白皮书表 3-1](https://public-download.obs.cn-east-2.myhuaweicloud.com/ascend/%E6%98%87%E8%85%BE950%20NPU%E6%9E%B6%E6%9E%84%E7%99%BD%E7%9A%AE%E4%B9%A6.pdf)，
不包含白皮书合计值中的 Vector 算力。具体内存及 ECC 配置仍未确认，API 参考值的 `qualification` 字段记录了这一说明，图表中不再重复显示。
FP4 的峰值保留为 null。归一化时，BF16 的算术强度除以 236.25 FLOP/byte，吞吐量除以
378 TFLOPS；FP8 则分别除以 472.5 FLOP/byte 和 756 TFLOPS。实测数据不变，FP8 延迟仍包含
激活量化耗时。

`GET /api/v1/operatorx/compare?op=gemm` 的响应在 `hardware[].reference` 中提供可选的参考值对象：
`label`、允许为 null 的 `peakTflops.{bf16,fp8,fp4}`、`memoryBandwidthTBs`、
`memoryBandwidthAssumed`、`source` 和 `qualification`。UI 与页面专属 API 共用参考值。
该接口仍属于 `page-bff`，不纳入公开 OpenAPI 契约；未知硬件不返回参考值。
Ascend 在浅色和深色图表中使用偏冷的深红色，与 AMD 的暖红色区分；颜色仅影响展示，不改变 API 数值。

硬件显示名称为 `950PR`，数据库中存储的硬件标识仍为 `ascend950pr`。对比 API 通过
`defaults.metricVsSizeSlice`、`defaults.rooflinePrecision` 和 `defaults.rooflineNormalized`
返回当前工作负载的初始选择，计算逻辑与 UI 共用同一个纯函数。Metric vs size 在已排序的分组中
选择排名最高的一个，条件是 950PR 在至少两个不同的正尺寸上有成功测量，且延迟为有限正数；
若没有分组满足条件，则沿用原有逻辑，选择最大的分组。missing、error 和 unsupported 结果不计入该条件。
Roofline 在 BF16 有 FLOP/byte 计数时默认选择 BF16，否则选择数据点最多的受支持精度；
Normalized 默认开启。用户主动选择的形状、精度和 Normalized 开关仍优先生效，不修改数据、硬件选择或测量值。

## Persistence and deployment

### Queued Ascend 950PR replacement

`packages/db/scripts/prepare-ascend950pr-bundle.py` converts the 23 October 2026
queued-timing SQLite journal to an external OperatorX bundle. It checks the
SQLite hash against `data-bf16.json`, every Ascend plot latency against the raw
upper-median timing samples, before/after correctness, the 3,936 plotted BF16-input
cases, 32 additional BF16/FP32-input cases, and the eight-hardware counts in
`audit-bf16.json`. The bundle retains each completed raw record, including its ten
event samples and correctness evidence. The other GPU points remain in their
original OperatorX runs; the plot snapshot records their run URLs and is used for
validation, not duplicate ingestion.

The queued bundle is about 81 MB. Raw drilldowns read its documents in batches of
eight so Neon never has to return the whole bundle as one JSON aggregate (its
single-response limit is 64 MB). The compact comparison continues to read the
stored projection, without loading those raw records.

Generate the bundle with the four positional arguments `latest.sqlite3`,
`data-bf16.json`, `audit-bf16.json`, and an output JSON path. After reviewing its
manifest and counts, the holder of `DATABASE_OPERATORX_WRITE_URL` can atomically
replace the old external run:

```sh
bun run admin:db:ingest:operatorx -- --bundle /path/to/external-ascend950pr-20261023-queued-v1.json \
  --replace-run external-ascend950pr-20261002-linear
```

Invalidate `scope=operatorx` and warm both comparisons after the write, as in the
ingest workflow. Replacement is one database transaction: if the new documents or
projections fail, the previous run remains. The runner and old target are both
checked as Ascend 950PR runs. The public GPU graph, launch-shield, cache, and
throttle policies differ from queued NPU timing; the source qualification is kept
in the manifest. Do not infer an identical protocol from the combined plots.

中文：上述脚本从 2026 年 10 月 23 日的 SQLite 原始记录生成 OperatorX bundle，并核对
文件哈希、每条延迟与十次 event timing 样本、计时前后的正确性检查，以及 BF16 图表的
3,936 条记录和额外 32 条 BF16/FP32 输入记录。其他 GPU 的数据沿用原有 run，不重复导入。
`--replace-run` 在同一事务中替换旧 950PR run；写入失败时旧数据仍保留。NPU queued
timing 与公开 GPU 结果的 graph、launch-shield、cache 和 throttle 策略不同，
比较时应保留这一限定。
原始记录约 81 MB；详情接口按每批八份文档读取，避免触发 Neon 单次响应 64 MB 的限制。
对比图仍读取精简数据，不加载这些原始记录。

Runs live in a separate OperatorX database (`opx_runs` and `opx_run_docs`) as raw
documents: each run's manifest and every shard's operatorx results JSON, verbatim.
The normalizer runs once during ingest to prepare compact comparisons; detail and
legacy reads still normalize raw documents on demand. A run that cannot be read is
never stored. Runs arrive by push:

- `bun run admin:db:ingest:operatorx -- --download <run-url-or-id>` stores a completed
  `operatorx-sweep.yml` run (any branch), downloading its manifest and shard artifacts.
- `admin:db:ingest:operatorx:ci` (no flag) reads pre-downloaded artifacts from
  `INGEST_ARTIFACTS_PATH` for `INGEST_RUN_ID`.
- `bun run admin:db:ingest:operatorx -- --bundle <file.json> ...` stores raw bundles
  as they are, for runs collected outside a sweep.

Re-ingesting a run replaces it.

When a dispatched InferenceX `operatorx-sweep.yml` run finishes, including one with
failed shards, it sends an `ingest-operatorx` repository dispatch with its run ID, and
the `Ingest OperatorX Results` workflow stores that run. GitHub delivers repository
dispatches only to workflows on the default branch. Run the workflow manually with a run
ID to backfill or re-ingest a run. OperatorX API responses stay cached until the workflow,
after storing a run, purges them with `/api/v1/invalidate?scope=operatorx`.

Setup:

1. `DATABASE_OPERATORX_WRITE_URL`: the owner connection (direct, non-pooled), for
   migrations and ingest only.
2. `DATABASE_OPERATORX_READONLY_URL`: a read-only role on the pooled endpoint; the
   only connection the app uses.
3. Run `bun run admin:db:migrate:operatorx -- --yes` before deployment.

## Local verification

With `OPERATORX_SOURCE=local`, `OPERATORX_LOCAL_ARTIFACT_DIR` points at a directory of
`<runKey>.json` raw bundles. This works only in development; production ignores it.
Do not replace measured latencies with synthetic values for manual verification.

### Landing-page Huawei link

The English and Chinese landing pages link Huawei Ascend 950PR results to
`/ubenchx/core-memory-profiles` and `/zh/ubenchx/core-memory-profiles`, respectively,
with a UbenchX subtitle. This entry no longer opens or prefetches OperatorX.
OperatorX remains available through its own navigation and API.

中文：英文和中文首页的华为 Ascend 950PR 入口显示 UbenchX 副标题，分别链接至
`/ubenchx/core-memory-profiles` 和 `/zh/ubenchx/core-memory-profiles`，
不再打开或预取 OperatorX。OperatorX 仍可通过自身导航入口和 API 访问。

### Cross-backend case alignment

The comparison API and all charts align cases by the full serialized operation
arguments, including precision, quantization, layout, and shape, rather than the
vendor-specific backend name. For each hardware/case, the view selects the fastest
successful finite positive latency across backends; ties keep the first result.
If no backend succeeds, the first explicit status is retained without inventing a
measurement. The newest-per-hardware/case/backend raw selection is unchanged.
`measurements[hardware].backend` identifies the selected backend alongside its
original run, revision, result index, kernel, and CUDA Graph flag. Head-to-head
points and timeline inspection use these same selected measurements. Thus identical
BF16 cases measured by `torch_npu_linear` and `vllm` can be compared, while different
precision or quantization arguments remain separate. No public OpenAPI operation
is added: OperatorX remains a documented page-owned API.

中文：对比 API 与所有图表按完整算子参数匹配测试用例，保留精度、量化、布局和形状差异，
不再要求不同设备使用相同 backend。同一设备、同一用例有多个 backend 时，选择成功且延迟为
有限正数的最快结果；延迟相同则保留首条结果。若没有成功结果，则保留首条明确状态，不补造测量值。
原始数据仍按设备、用例和 backend 分别选取最新结果。`measurements[hardware].backend`
记录所选 backend，并保留原始 run、revision、result index、kernel 和 CUDA Graph 标记；
Head to head 与时间线使用同一条测量记录。OperatorX 仍使用页面专属 API，不新增公开 OpenAPI 接口。

### Parallel timeline reads

Timeline reads share one raw fetch per run, with at most four runs concurrent.
Request order, revision checks, missing/null results, and error handling are preserved.

中文：时间线按运行复用读取，最多四个运行并发；保留请求顺序、revision 校验、缺失结果和错误处理。

## Shared merged-comparison cache

`BLOB_CACHE_PREFIX` and `BLOB_READ_WRITE_TOKEN` enable shared database comparisons
above Next's 2 MB limit. Keys include op, ordered revisions, format version, and
namespace; distinct deployments need distinct namespaces or prefixes. Partial or
replaced revisions remain uncached/no-store. Blob failures retain the source path.
Scope invalidation awaits OperatorX Blob deletion and clears its CDN tag. A full
purge, which every results ingest triggers, keeps OperatorX's CDN tag and Blob
subtree, so only an OperatorX ingest makes its cached responses cold.
Vercel's CDN cache key includes the deployment, so each production promotion
starts cold. The `Warm After Deploy` workflow runs on Vercel's
`vercel.deployment.promoted` dispatch (automatic deploys, manual promotions, and
rollbacks) and fetches both OperatorX pages, `/runs`, and the GEMM and MoE
comparisons in full. The CDN cache is per region, so this fills the runner's
region and leaves a warm function for the others. Warm process caches remain until
revision or code/version changes. The run-list query remains; measure benefits in the deployment
region, and bump `OPERATORX_COMPARISON_VERSION` when changing derivation.

中文：配置上述 Blob 环境变量后，可共享超过 2 MB 的对比数据，按算子、revision、版本和
namespace 分隔。不同部署需使用独立 namespace 或前缀。部分失败或被替换的 revision
不会缓存；Blob 失败时仍可读取来源数据。定向清除等待 Blob 删除并清除 CDN 标签。每次结果数据
写入都会触发完整清除，但完整清除不影响 OperatorX 的 CDN 标签和 Blob 子目录，因此只有
OperatorX 自身的写入才会使其缓存失效。Vercel 的 CDN 缓存键包含部署本身，因此生产环境每次切换到新部署后
缓存都为空。`Warm After Deploy` 工作流由 Vercel 的 `vercel.deployment.promoted` 事件触发（涵盖自动部署、
手动 promote 和回滚），完整拉取两个 OperatorX 页面、`/runs` 以及 GEMM 和 MoE 对比数据。CDN 缓存按区域
划分，因此该流程只填充 runner 所在区域的缓存，其他区域则可复用已预热的函数实例。内存缓存由 revision 或代码版本变化更新。仍需查询运行列表，并在部署区域测量收益。

### Progressive rendering and intent prefetch

The first chart mounts eagerly; others mount within 300px of the viewport or on
focus, then retain their controls. Without IntersectionObserver all charts render.
Landing-link hover/focus prefetches the localized route and default GEMM query,
sharing the destination's five-minute cache. These are presentation-only controls;
API selectors, results, and click analytics are unaffected.
