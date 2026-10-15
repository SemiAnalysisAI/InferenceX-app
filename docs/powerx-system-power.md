# Modeled system power in PowerX

PowerX compares measured GPU-board watts with modeled IT and facility watts for
`single_turn` rows at every input/output length and for AgentX
(`agentic_traces`) rows. The chart transformation, the views API, the Profit
Estimator, and the offline article exporter all call `modelSystemPower`; the
benchmark producer and the raw benchmark API keep returning the original
measurements.

The model is the `power_model` package in SemiAnalysisAI/InferenceX
(GPL-3.0-only, labeled "Beta Experimental" upstream), pinned at `REVISION` in
`packages/app/scripts/generate-system-power-reference.py`.
`system-power-model.profiles.json` records that commit, the git tree id of the
pinned `power_model` directory, and per-hardware constants read from the
upstream objects. For the eight-GPU HGX/OAM chassis the app supports, the
upstream estimate reduces to one closed form per chassis, which
`estimateChassisPower` in `system-power-model.ts` evaluates without rounding:

| Step         | Watts per chassis                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Component DC | `8 × g + fixedDcWatts[workload][scaleOut]`: board non-GPU parts, CPUs, DIMMs, NICs, NVMe, PCIe switches, and transceivers           |
| Fans         | `nameplate × pwm³`, with `pwm = clamp(minPwm + (maxPwm − minPwm) × min(1, componentDc ÷ fullCoolingLoad)^exponent, minPwm, maxPwm)` |
| DC load      | component DC + fans; above the PSU's modeled capacity the estimate is unavailable (`reason: 'model-domain'`)                        |
| Chassis AC   | DC ÷ PSU efficiency at `DC ÷ loadSharingCapacity` (linear interpolation, clamped at the ends of the curve)                          |
| IT           | chassis AC + `networkWatts[scaleOut]`, the chassis share of the scale-out switches, which bypasses the PSU and fans                 |
| Facility     | IT × the PUE of the system's upstream cooling mode (1.3 for every supported air-cooled chassis)                                     |

`g` is the mean measured watts per GPU on that chassis. Numerical parity with the
upstream model establishes implementation equivalence, not empirical chassis
calibration.

## Operating state

The upstream model takes a workload state and a scale-out flag. `modelSystemPower`
derives both from the row and its resolved chassis topology, and records them on
the supported estimate as `operatingState`; the system-power tooltip shows them.

| Row                                                                                                       | Workload state                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `benchmark_type: 'single_turn'`, any ISL/OSL                                                              | `fixed-seq-len`                    |
| `agentic_traces` with KV offload enabled (`isKvOffloadEnabled` over `kv_offloading`, else `offload_mode`) | `agentic-cpu-offloading`           |
| Other `agentic_traces`                                                                                    | `agentic`                          |
| Any other benchmark type                                                                                  | unavailable (`reason: 'workload'`) |

Every offload tier other than `none` counts as enabled, so NVMe-only offload also
maps to `agentic-cpu-offloading`. Scale-out is on for disaggregated rows, for rows
modeled on more than one chassis, and for a Mooncake KV store
(`kv_offload_backend: 'mooncake'`), which moves KV over the RDMA NICs even on one
node. Scale-out switches the NICs and the network share from idle to active power.

## Updating the model for historical results

Modeled power is derived from retained measurements when the browser or a shared
views API transforms a benchmark row. Changing the model does not rewrite the
original GPU measurements or require a per-run database backfill.

1. Set `REVISION` in `packages/app/scripts/generate-system-power-reference.py` to
   the intended SemiAnalysisAI/InferenceX commit, and map any new upstream
   chassis in `SYSTEMS`.
2. Run the generator with Python 3.12 or newer and pydantic 2, the upstream
   package's only dependency (for example the venv from the upstream README's
   install step). `--inferencex` names a local InferenceX clone that contains
   the commit; it defaults to `$INFERENCEX_REPO`, then to `../InferenceX` beside
   this repository:

   ```sh
   python packages/app/scripts/generate-system-power-reference.py --inferencex ../InferenceX
   ```

   The script extracts `power_model` at the pin with `git archive`, imports it,
   reads every constant from the upstream objects, and asserts that the closed
   form reproduces `create_power_model(...).estimate_breakdown(g)` to a relative
   1e-12 over a dense grid of GPU watts, fan and PSU knots, and the capacity
   edge, for every system, workload state, and scale-out flag. Only then does it
   write `system-power-model.profiles.json` and
   `system-power-model.reference.json`. A failed assertion means the upstream
   equations changed; update `closed_form` in the generator and
   `estimateChassisPower` together. Rerunning at the same pin is byte-identical.

3. Run `src/lib/system-power-model.test.ts` (parity with every reference case)
   and the admission tests, then deploy the app. Existing browser sessions need
   the updated bundle. Derived API responses need the normal authenticated cache
   invalidation or cache expiry; deployment alone does not establish that every
   cached response uses the new revision.
4. Regenerate frozen CSV/JSON exports separately. If the revised model needs
   inputs that were never recorded, those rows stay unavailable until the input
   gap is resolved. A new benchmark's power must not be attached to an older
   benchmark's throughput.

## Boundary and assumptions

The input is measured mean GPU power during a validated serving window. Modeled
IT power adds the upstream model's board, CPU, DRAM, NIC, storage, PCIe switch,
transceiver, fan, and PSU-loss estimates for the operating state, plus the
chassis share of the scale-out switches. Facility power applies the system's
PUE once, after IT power. Measured GPU power does not change. Cooling describes
the modeled chassis, not verified benchmark-site cooling. These are model
inputs, not measured CPU, DRAM, or network utilization.

| Hardware identity | Upstream system | Upstream chassis class   |
| ----------------- | --------------- | ------------------------ |
| `h100`, `h200`    | `hopper`        | `HopperHGXSystemChassis` |
| `b200`            | `b200`          | `B200HGXSystemChassis`   |
| `b300`            | `b300`          | `B300HGXSystemChassis`   |
| `mi300x`          | `mi300`         | `MI300HGXSystemChassis`  |
| `mi325x`          | `mi325`         | `MI325HGXSystemChassis`  |
| `mi355x`          | `mi355`         | `MI355HGXSystemChassis`  |

All listed profiles describe a complete eight-GPU chassis. GB200 and GB300 are
rack-scale systems upstream and stay unsupported here. Their rack topology is not
substituted with B200 or B300.

A partially allocated chassis (one to seven measured GPUs on one host) is
modeled at measured per-GPU power × 8, the upstream model's full-chassis input,
and assumes the unmeasured GPUs run the same workload. The estimate is labeled
`chassisBasis: 'extrapolated'`: per-GPU values divide by the modeled chassis GPU
count (`modeledGpuCount`), while `deploymentItWatts` / `deploymentFacilityWatts`
keep only the measured GPUs' share of each chassis. This is not a proportional
share of a chassis evaluated at partial load; fixed components, the fan curve,
and PSU efficiency are all evaluated at full-chassis load. Missing or invalid
telemetry, inconsistent counts, missing host placement, more than one chassis
per host, and model-domain overflow remain unavailable.

For a single-node deployment, the producer's physical width is `TP * PP * PCP`.
EP partitions that width. Some existing API configuration aliases contain
`TP * EP`; the model cross-checks the physical width against measured total and
per-GPU watts instead of trusting or summing those aliases. Multi-node and
disaggregated inputs require one chassis (one to eight GPUs) per measured
worker, distinct worker hosts, and consistent total/role watts. A role average
alone cannot establish physical placement or evaluate each host's nonlinear
model. CPU-only frontend workers are excluded from GPU-chassis counting. Separate CPU-only
frontend/router hosts are outside this estimate; CPU power within GPU chassis
follows the operating state.

The default measured contract is numeric `power_valid=1` and metric schema 2.
The original validated single-node producer predates the schema marker but
already defines both watts fields identically. This path retains the absent
schema and reports `validated-unversioned-single-node`; it does not upgrade the
source or admit unversioned disaggregated power. The article receipt additionally
pins the producer checkout and retains each original audit artifact.

## Profit Estimator power basis

The per-GW Profit Estimator offers provisioned power, measured + modeled power,
and a paired comparison in Benchmark Config, beside the other benchmark
controls. Provisioned remains the default. `c_power=modeled` and
`c_power=compare` select the alternative without an insider unlock.
The alternative reuses the same hardware, P90 target, throughput frontier,
token mix, prices, utilization, and per-GPU-hour costs. It changes only the
facility kW/GPU used to calculate capacity per GW. Consequently, revenue,
compute expense, license fee, and profit scale together; profit margin does not
change. Electricity expense is not recomputed separately.

This opt-in AgentX estimate requires validated schema-v2 telemetry and chassis
supported by the pinned model. Fully measured eight-GPU chassis are supported
on a single node, per measured worker host, or across an aggregate multinode
deployment without per-worker telemetry at the deployment-mean GPU power
(`topologyBasis: 'uniform-hosts'`; symmetric TP/PP/DP shards load each host alike).
Validated single-node 1/2/4-GPU allocations use full-chassis extrapolation: fill
an eight-GPU server with whole replicas at the measured per-GPU power and
throughput, then divide modeled facility power by eight. This assumes replica
co-location does not change performance or power; it is not a measurement of a
partly idle server. The chart, tooltip, and CSV label every extrapolated estimate,
including interpolation with one partial knot. Unsupported GB200/GB300 chassis,
partial multi-host allocations, disaggregated deployments without per-worker
telemetry, allocations that cannot tile eight GPUs, and missing/invalid
measurements stay unavailable with distinct reasons. Host power follows the
row's AgentX workload state, including KV offload.

At an exact frontier point, use that point's modeled power. Between points,
estimate power linearly using the same two knots as the existing throughput
interpolation; never select a different point to fill a power gap. The estimate
uses PUE 1.3 and an additional 10% planning margin. These assumptions, including
the upstream workload-state host power, are not validated peak-load provisioning
or a calibrated AgentX system measurement. The UI and CSV label the estimate and its assumptions.
`c_power=modeled` and `c_power=compare` preserve the selection in share URLs.
Unavailable historical estimates use the hardware registry when a chip is absent
from today's results and include the source date/run label.

每 GW 利润估算器在基准测试配置中提供预配功耗、实测加建模功耗，以及两种方式的同口径
对比；默认仍采用预配功耗。两种方式使用同一硬件、P90 目标、吞吐量前沿、token 比例、
价格、利用率和每 GPU 小时成本，仅改变换算每 GW 容量时采用的设施功率。因此收入、
计算成本、模型许可费和利润按相同比例变化，利润率不变；不会另行重新计算电费。

该选项与其他基准测试配置控件放在一起，无需内部解锁。`c_power=modeled` 与
`c_power=compare` 会直接选中对应的估算方式。

AgentX 估算仅接纳通过验证的 schema-v2 功耗，且要求适用模型的机箱；主机功耗按该行的
AgentX 工作负载状态建模，包括 KV offload。
实测单卡、双卡或四卡配置可复用现有整机外推：假设在八卡服务器上部署多个完整实例，
每卡功耗和吞吐量保持不变，再将建模设施功耗除以八。这要求实例共置不改变性能或功耗，
不代表部分 GPU 闲置时的整机实测功耗。图表、提示框和 CSV 均标注整机外推；若插值
使用的任一数据点采用外推，也保留该标注。GB200/GB300 等无匹配模型的机箱、多节点
配置、无法整除八卡的实例，以及缺失或无效功耗仍不可用，并分别说明原因。精确前沿点使用自身的功耗；点间采用原吞吐量插值的
同一对数据点线性估算功耗，不换用其他点填补缺失。PUE 取 1.3，另加 10% 功耗余量；
这些假设和上游按工作负载状态估算的主机功耗尚未通过 AgentX 系统校准，也不构成峰值供电容量
验证。界面与 CSV 会注明估算及其假设，分享链接通过 `c_power` 保留所选方式。
历史估算不可用时，若当天结果不含该芯片，则从硬件注册表获取名称；提示会附上来源
日期或运行标签，避免与当前结果混淆。

## Offline comparison export

The exporter reads a local cohort envelope and writes a **new** output directory:

```sh
bun packages/app/scripts/export-modeled-system-power.ts \
  --input /path/to/original-qwen-article.input.json \
  --output /path/to/new-original-qwen-comparison

bun packages/app/scripts/export-modeled-system-power.ts \
  --input /path/to/qwen35-current.input.json \
  --output /path/to/new-current-qwen-comparison
```

The maintained input shape is `ComparisonInput` in the script:

```ts
{
  cohort: string,
  metadata: { /* source URLs, capture times, hashes and cohort selection */ },
  rows: [{
    id: string,               // stable observation identity
    cell?: string,            // optional group of original replicates
    benchmark: BenchmarkRow, // original API row or existing ETL output
    rawInput?: unknown,      // original artifact before ETL normalization
    source?: object,         // run, attempt, producer revision and artifact receipt
    audit?: object           // matching original power-validation sidecar
  }]
}
```

Use the existing `normalizeArtifactRows` / `mapBenchmarkRow` for raw producer
aggregates. Keep the original aggregate as `rawInput`, retain original schema
markers, and check that its measured metrics survive normalization unchanged.
Use complete raw API responses for current snapshots, then select the exact
`single_turn`, `isl=8192`, `osl=1024` workload locally. Retain every scoped row,
including unsupported hardware and missing/invalid power; never mix a current
snapshot into the frozen article campaign.

Outputs are `comparison.json`, `comparison.csv`, and optional `cells.csv`.
The JSON includes original input rows, measured validity, modeled outputs with
their operating state and PUE, audit windows, and source provenance. CSV includes separate measured
and modeled columns; unavailable numbers are blank. Invalid/unverified raw
values remain in the raw-input record and are not labeled valid measurements.
Metadata records input and implementation SHA-256 hashes, model and application
revisions, worktree state, generation time, and full profile provenance. Generate
the final release export from the intended application commit; file hashes also
identify any local changes during development.

Modeled energy is available only when a matching valid audit sidecar supplies an
exact telemetry duration, physical GPU count, and successful request/token
denominators. It is modeled deployment power (the measured GPUs' share of each
chassis) multiplied by that duration, not a time integral of measured wall power. Actual output-token counts are used;
nominal `1024` tokens per query never replace recorded counts. No kernel-level
prefill/decode energy is inferred. API snapshots without these sidecars receive
power estimates only.

Each replicate is modeled before aggregation. A cell mean averages its modeled
replicate outputs; it does not evaluate the model at mean watts. If any replicate
is unavailable, the corresponding mean remains unavailable rather than silently
dropping that replicate.

## 中文说明

模型结果在浏览器或共享 views API 转换 benchmark 数据时计算，不写回原始 GPU
测量值。更新模型时，先修改生成脚本中固定的 InferenceX commit，再用装有 pydantic 2
的 Python 3.12+ 运行脚本并指向本地 InferenceX 仓库。脚本用 `git archive` 取出该
commit 的 `power_model`，从上游对象读取全部常量，并在写出 profiles 和 reference
JSON 之前断言闭式公式与上游 `estimate_breakdown` 一致；断言失败说明上游公式有变，
需同步修改脚本中的 `closed_form` 和 TypeScript 实现。同一 commit 重复运行，输出
逐字节相同。通过一致性及准入测试后部署，刷新浏览器，并使派生 API 缓存失效或等待其过期。
冻结的 CSV/JSON 需另行导出。通常无需逐 run 回填数据库；若新模型需要历史记录中
没有的输入，应保留不可用状态，也不能把新一轮测得的功耗配到旧吞吐结果上。

PowerX 的系统功耗结果以实测 GPU 功率为输入，使用固定版本的 InferenceX 功耗模型
（上游标注为 Beta Experimental）估算八卡机箱的 IT 功耗：机箱交流功耗加上该机箱
分摊的 scale-out 交换机功耗，再乘以一次 PUE 得到设施功率估计。适用范围包括所有
输入/输出长度的 `single_turn` 数据和 AgentX（`agentic_traces`）数据。主机 CPU、
DRAM 和 NIC 功耗取决于运行状态：`single_turn` 对应 `fixed-seq-len`；开启 KV offload
的 AgentX 数据对应 `agentic-cpu-offloading`（包括仅 offload 到 NVMe 的情况），其余
AgentX 数据对应 `agentic`。分离式部署、多机箱部署或使用 Mooncake KV 存储时开启
scale-out，NIC 与交换机按活跃功耗计，否则按空闲功耗计。这些是模型参数，不是实测
利用率。数值一致性只说明实现与上游等价，不代表完成了实机校准。

PUE 取自上游模型的冷却方式；当前支持的机箱均为风冷，PUE 为 1.3，仅作用于 IT
功耗，不改变 GPU 实测功率。这里的冷却方式指建模机箱，并非已核实的测试站点配置。

仅使用部分 GPU 的机箱（单台主机上实测 1–7 张 GPU）按实测每卡功率 × 8 建模，
即上游模型的满机箱输入，并假设未实测的 GPU 运行相同负载。结果标记为
`chassisBasis: 'extrapolated'`：每卡数值按建模机箱的 GPU 总数分摊，
`deploymentItWatts` 只保留实测 GPU 在各机箱中的份额。这不是把
部分分配的机箱按比例分摊：固定组件、风扇曲线和 PSU 效率都在满机箱负载点求值。
GB200、GB300 在上游是机架级系统，此处不支持，也不能套用 B200、B300 模型。缺失、无效和不支持的
情况保持不可用。纯 CPU frontend worker 不计入 GPU 机箱数；独立的纯 CPU
frontend/router 主机不在估算范围内，GPU 机箱内的 CPU 功耗按运行状态建模。

导出时每次测量先独立计算，再对同一 cell 的重复测量取平均。能耗使用审计记录中的
实际窗口和成功 token 数，按实测 GPU 的份额计算，明确标记为估计值，不改写原有
GPU 实测指标。当前 API 快照与原文章冻结数据分别导出，避免混用不同时间和配置的
结果。

## Measured P75 and P90 GPU power

`y_measuredP75Power` and `y_measuredP90Power` show the time-weighted P75 and P90 of
synchronized fleet GPU-board power over the validated load window, divided by GPU
count. They share the regular measured-power chart path for official points and
unofficial overlays. Missing or unvalidated percentile data remains unavailable;
average power is never used as a substitute. These metrics are separate from modeled
chassis AC power and individual-device percentiles.

P75 and P90 backfills use the same 34 original validated traces and exact windows
recorded in `docs/data/power-p90-backfill.json`.

`y_measuredP75Power` 和 `y_measuredP90Power` 分别显示已验证负载窗口内整组 GPU
功耗按时间加权的 P75 和 P90，再按参与测量的 GPU 数量均摊。正式数据与非正式
运行叠加层使用同一计算和绘图路径。缺少测量值或未通过验证时保持不可用，
不会用平均功耗替代。该指标与机箱交流功耗估算、单个设备的功耗分位数不同。
两个分位数均由审计记录中的同一批 34 份原始遥测及其测量窗口重新计算。
