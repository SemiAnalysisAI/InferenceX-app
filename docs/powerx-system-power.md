# Modeled system power in PowerX

PowerX can compare measured GPU-board watts with estimated chassis AC watts for
the non-agentic 8192-input/1024-output workload. The existing app transformation
and the offline article exporter both call `modelSystemPower`; the API and
benchmark producer continue returning their original measurements.

`system-power-model.profiles.json` records the pinned power model revision,
component source hashes, hardware mapping, complete platform configuration, and
fixed inference assumptions. Its profiles come from executing the original
Python components. `system-power-model.ts` preserves their nonlinear fan curve,
PSU efficiency interpolation, intermediate rounding, and PUE ordering. The
Python-generated reference cases test this implementation against the source.

The pinned source currently identifies itself as **DRAFT / pending human
verification**. Numerical parity establishes implementation equivalence, not
empirical chassis calibration.

## Boundary and assumptions

The input is measured mean GPU power during a validated serving window. The
modeled chassis AC output adds the source model's CPU, DRAM, networking, storage,
board, fans, and PSU conversion losses. Facility power is a separate estimate:
PUE is applied after chassis AC, including the source's rounding order.

The fixed README inference sweep uses `u_cpu=0.20`, `u_ram=0.20`, `u_pcie=0.05`,
and `u_nvme=0.0`. The pinned Python model defaults to PUE `1.2`; PowerX uses
`1.3` for its supported air-cooled chassis profiles. Utility power = critical IT
power × PUE (`1.3` air, `1.1` DLC).
The factor applies after chassis AC; measured GPU power and chassis AC do not change.
Cooling describes the modeled chassis, not verified benchmark-site cooling.
The chassis profiles do not model DLC; `--pue` remains an explicit facility-factor
override and does not convert an air-cooled chassis model into a DLC model. The
NVL72 rack profiles below are direct-liquid-cooled and default to `1.1`.
Platform-specific network assumptions,
fan control, component counts, and chassis defaults are preserved in the
generated profile; every JSON export includes that profile and every CSV row
includes its applicable assumptions and profile hash. These are model inputs,
not measured CPU/DRAM utilization.

| Hardware identity | Source chassis implementation                                 |
| ----------------- | ------------------------------------------------------------- |
| `h100`            | `human_verified/hgx_h100_chassis/h100_chassis_power_model.py` |
| `h200`            | `human_verified/hgx_h200_chassis/h200_chassis_power_model.py` |
| `b200`            | `human_verified/hgx_b200_chassis/b200_chassis_power_model.py` |
| `b300`            | `human_verified/hgx_b300_chassis/b300_chassis_power_model.py` |
| `mi300x`          | `human_verified/mi300x_chassis/mi300x_chassis_power_model.py` |
| `mi325x`          | `human_verified/mi325x_chassis/mi325x_chassis_power_model.py` |
| `mi355x`          | `human_verified/mi355x_chassis/mi355x_chassis_power_model.py` |

All listed profiles describe a complete eight-GPU chassis. Their topology is not
substituted onto GB200 or GB300, which use the NVL72 rack profiles instead:

| Hardware identity | Source rack implementation                                        |
| ----------------- | ----------------------------------------------------------------- |
| `gb200`           | `human_verified/gb200_nvl72_rack/gb200_nvl72_rack_power_model.py` |
| `gb300`           | same module, `gb300_nvl72_rack_config`                            |

The rack profiles (`rackProfiles`) take **measured** compute-module watts per tray
as their input: the module sensor total (`avg_total_module_power_w`) when the
producer publishes it, otherwise GPU-board watts plus the Grace-socket total
(`avg_total_cpu_power_w`) with the source's regulator-loss allowance on the GPU
share. The Grace CPU and LPDDR5X are never modelled; rows without
`cpu_power_valid=1` and the Grace-side keys stay unavailable (`cpu-telemetry`).
Each measured worker host is one compute tray (four GPUs, two Grace sockets); an
aggregate multinode row without a per-worker array is `gpuCount / 4` trays at the
deployment mean, cross-checked against the Grace-socket count and the CPU leg's
`power_audit.cpu.observed_sockets`. The
measured trays are folded into one rack of 18 trays matching their mean
compute-module input, the power-shelf efficiency curve is evaluated once at that
rack's DC load (as the source `gb200_nvl72_rack_power` does with its single
per-tray input), and every tray takes the same 1/18 share, so NVSwitch trays,
power shelves, and management switches are amortised over 72 GPUs. Chassis, by
contrast, own their fans and PSUs and are each evaluated at their own load. The
result carries `topologyBasis: 'nvl72-trays'`, `measuredBasis`, and `sensorKind`.
A partially allocated tray extrapolates only the GPU-board share (a module reading
already covers the whole tray) and is labeled `extrapolated`. The pinned revision
`963ead8b` is the power-model repo's `feat/gb200-nvl72-rack-model` branch, pending
push upstream. The NVL72 section below lists the measured input, the modeled
residual and the Profit Estimator gate rules.

A partially allocated chassis (one to seven measured GPUs on one host) is
modeled at measured per-GPU power × 8. That is the same `n_gpu × W/GPU` input
the source sweep scripts feed each chassis model, and it assumes the unmeasured
GPUs run the same workload. The estimate is labeled `chassisBasis:
'extrapolated'`: per-GPU values divide by the modeled chassis GPU count
(`modeledGpuCount`), while `deploymentAcWatts` / `deploymentFacilityWatts` keep
only the measured GPUs' share of each chassis. This is not a proportional share
of a chassis evaluated at partial load; fixed components, the fan curve, and PSU
efficiency are all evaluated at full-chassis load. Missing or invalid telemetry,
inconsistent counts, missing host placement, more than one chassis per host, and
model-domain overflow remain unavailable.

For a single-node deployment, the producer's physical width is `TP * PP * PCP`.
EP partitions that width. Some existing API configuration aliases contain
`TP * EP`; the model cross-checks the physical width against measured total and
per-GPU watts instead of trusting or summing those aliases. Multi-node and
disaggregated inputs require one chassis (one to eight GPUs) per measured
worker, distinct worker hosts, and consistent total/role watts. A role average
alone cannot establish physical placement or evaluate each host's nonlinear
model. CPU-only frontend workers are excluded from GPU-chassis counting. Separate CPU-only
frontend/router hosts are outside this estimate; CPU power within GPU chassis
still uses the source's fixed 20% utilization assumption.

The default measured contract is numeric `power_valid=1` and metric schema 2.
The original validated single-node producer predates the schema marker but
already defines both watts fields identically. This path retains the absent
schema and reports `validated-unversioned-single-node`; it does not upgrade the
source or admit unversioned disaggregated power. The article receipt additionally
pins the producer checkout and retains each original audit artifact.

## NVL72 rack estimate (GB200, GB300)

**Measured input.** Every compute tray is fed a measured compute-module figure; the
Grace CPU and LPDDR5X are never modeled. The producer's CPU power leg (srt-slurm,
ACPI hwmon) publishes, over the same formal window as GPU energy,
`avg_cpu_socket_power_w`, `avg_total_cpu_power_w`, `total_cpu_energy_j`, and, when
the `Module Power Socket` sensor exists on every socket, `avg_total_module_power_w`
and `total_module_energy_j`, with the independent verdict `cpu_power_valid` and the
`power_audit.cpu` block (sensor kind, collector, socket coverage, reason codes).
Admission requires `power_valid=1`, schema 2, `cpu_power_valid=1`, positive Grace
watts, and `avg_total_cpu_power_w / avg_cpu_socket_power_w` equal to two sockets per
tray. Basis selection: `module` when `avg_total_module_power_w` is present (the
reading already contains the GPU boards, so it is never scaled), otherwise
`gpu-plus-grace` (GPU-board watts × 4 plus the Grace-socket total per tray, with the
source's regulator-loss allowance `regulatorLossFracOfTdp / (1 − frac)` on the GPU
share only). A present-but-invalid module key makes the row unavailable
(`cpu-telemetry`); it never falls back to the Grace socket silently.

**Modeled residual.** Everything outside the compute modules comes from the pinned
profile (`rackProfiles`), evaluated once for a rack of 18 trays at the measured
trays' mean input (the shelf curve sees the whole rack's DC load, never one tray's)
and amortised over 72 GPUs; the parameters marked UNVERIFIED carry a documented
range in `unverifiedParameters` and no published rail:

| Component (per rack unless noted)      | GB200                                                                                | GB300                                          | Source status                            |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------- |
| NVSwitch tray silicon (9 trays)        | 406.4 W / tray at `u_nvlink` 0.5                                                     | same                                           | `blackwell_nvswitch` model               |
| NVSwitch tray residual                 | 50 W / tray                                                                          | same                                           | UNVERIFIED (20–80 W)                     |
| Compute-tray NICs with optics          | ConnectX-7, 4 × 31.5 W = 126 W / tray                                                | ConnectX-8 integrated PCIe, 4 × 78.8 W = 315 W | `generic/connectx7`, `generic/connectx8` |
| Compute-tray BlueField-3 DPUs          | 2 × 65 W idle = 130 W / tray                                                         | same                                           | `generic/dpu`, idle only                 |
| Compute-tray NVMe                      | 22 W / tray idle                                                                     | same                                           | `generic/nvme`, idle only                |
| Compute-tray fans                      | 130 W / tray                                                                         | same                                           | UNVERIFIED (40–220 W)                    |
| Compute-tray board residual            | 40 W / tray                                                                          | same                                           | UNVERIFIED (20–60 W)                     |
| Management switches                    | 2 × 100 W                                                                            | same                                           | profile constant                         |
| Tray 50 V → 12 V conversion            | efficiency 0.9725 on tray loads                                                      | same                                           | UNVERIFIED (0.96–0.985)                  |
| Regulator allowance (`gpu-plus-grace`) | 15% of GPU TDP, GPU share only                                                       | same                                           | Grace tuning guide                       |
| Power shelf                            | 264 kW installed, 132 kW redundant; efficiency 0.90 → 0.94 → 0.965 at 10/20/30% load | same                                           | profile curve                            |
| Facility PUE                           | 1.1 (direct liquid cooling)                                                          | same                                           | PowerX policy, applied once to rack AC   |

Rack DC above the installed shelf capacity (264 kW) overflows the efficiency curve
and the row is unavailable (`model-domain`). Rounding follows the source: rack AC is rounded
to 0.1 W before PUE. Python-generated `rackCases` prove parity with the pinned
implementation for both variants, both bases, every shelf knot and PUE 1.0–1.2.

**Gate rules (Profit Estimator).** Planning kW/GPU = deployment facility watts ÷
measured GPUs ÷ 1000 × 1.1. It accepts fully measured eight-GPU chassis
(`chassisBasis: 'full'` on the `single-node`, `worker-hosts`, or `uniform-hosts`
basis; see the Profit Estimator power basis section), or an `nvl72-trays` estimate
whose trays are all fully measured (four GPUs and two sockets each: one tray per
measured worker host, or, for an aggregate multinode row without a per-worker
array, `gpuCount / 4` trays at the deployment mean, cross-checked against the
Grace-socket count and `power_audit.cpu.observed_sockets`). Partial trays are
extrapolated in the chart but rejected here, as partial chassis are. Between two
frontier knots both must share the same measured basis and sensor kind; a module
knot beside a Grace-socket knot stays unavailable rather than blending sensors. The
bar tooltip, the caption line under the power note and the CSV columns `Power
basis`, `Power sensor`, `System power profile` name the basis (measured module, or
measured GPU board + Grace socket with regulator loss modeled), the sensor kind, and
the pinned profile (`modelPath @ modelRevision sha256:<source file hash>`) per row.
The `?unofficialrun=` overlay rule does not apply to the Profit Estimator basis
control: the estimator prices official frontier points only.

## Profit Estimator power basis

The per-GW Profit Estimator offers provisioned power, measured + modeled power,
and a paired comparison in Benchmark Config. Provisioned remains the default.
The control uses the existing insider feature gate and is hidden while locked.
Unlock with ↑↑↓↓ (`inferencex-feature-gate=1` in local storage). While locked,
`c_power` cannot activate an alternative calculation or fetch full power rows;
relocking restores provisioned estimates immediately.
The alternative reuses the same hardware, P90 target, throughput frontier,
token mix, prices, utilization, and per-GPU-hour costs. It changes only the
facility kW/GPU used to calculate capacity per GW. Consequently, revenue,
compute expense, license fee, and profit scale together; profit margin does not
change. Electricity expense is not recomputed separately.

This opt-in AgentX estimate requires validated schema-v2 telemetry and either fully
measured eight-GPU chassis supported by the pinned model (one single-node chassis,
one chassis per measured worker host, or, for an aggregate multinode deployment
whose producer emits no per-worker telemetry, every chassis at the deployment-mean
GPU power: `topologyBasis: 'uniform-hosts'`, since symmetric TP/PP/DP shards load
each host alike) or NVL72 compute trays that are all fully measured
(`cpu_power_valid=1`, see the NVL72 section). Partial allocations, disaggregated
deployments without per-worker telemetry, NVL72 rows without CPU-side telemetry,
and missing/invalid measurements stay unavailable. The ordinary 8K/1K
transformation keeps its existing admission policy.

At an exact frontier point, use that point's modeled power. Between points,
estimate power linearly using the same two knots as the existing throughput
interpolation; never select a different point to fill a power gap, and never blend
two knots measured on different bases. The estimate uses PowerX's PUE policy (1.3 for
air-cooled chassis, 1.1 for DLC NVL72 racks) and an additional 10% planning margin.
These assumptions, including the fixed CPU/DRAM utilization above, are not validated
peak-load provisioning or AgentX system calibration. The UI and CSV label the
estimate, its assumptions, and per row the measured basis, sensor kind and profile.
`c_power=modeled` and `c_power=compare` preserve the selection in share URLs.
Unavailable historical estimates use the hardware registry when a chip is absent
from today's results and include the source date/run label.

每 GW 利润估算器在基准测试配置中提供预配功耗、实测加建模功耗，以及两种方式的同口径
对比；默认仍采用预配功耗。两种方式使用同一硬件、P90 目标、吞吐量前沿、token 比例、
价格、利用率和每 GPU 小时成本，仅改变换算每 GW 容量时采用的设施功率。因此收入、
计算成本、模型许可费和利润按相同比例变化，利润率不变；不会另行重新计算电费。

该选项由现有内部功能开关控制，锁定时隐藏。按 ↑↑↓↓ 解锁（本地存储
`inferencex-feature-gate=1`）。锁定时，`c_power` 不会启用其他估算方式或触发完整功耗
数据请求；重新锁定后立即恢复预配功耗估算。

AgentX 估算仅接纳通过验证的 schema-v2 功耗，且要求完整的单节点八卡机箱及适用模型，
或全部 tray 均完整实测（`cpu_power_valid=1`，见下文 NVL72 一节）的 NVL72 计算 tray。
部分卡分配、缺少 CPU 侧实测的 NVL72 行，以及缺失或无效功耗保持不可用。原有
8K/1K 转换路径的接纳规则不变。精确前沿点使用自身的功耗；点间采用原吞吐量插值的
同一对数据点线性估算功耗，不换用其他点填补缺失，也不会把两种实测口径不同的数据点
混合估算。PUE 按 PowerX 策略取值（风冷机箱 1.3，液冷 NVL72 机架 1.1），另加 10%
功耗余量；这些假设和上述固定 CPU/DRAM 利用率尚未通过 AgentX 系统校准，也不构成
峰值供电容量验证。界面与 CSV 会注明估算及其假设，并逐行标出实测口径、传感器类型
和所用 profile；分享链接通过 `c_power` 保留所选方式。
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
  --output /path/to/new-current-qwen-comparison --pue 1.3
```

Without `--pue`, each row uses the dashboard's default for its hardware (`1.3` for
the air-cooled chassis profiles, `1.1` for the DLC NVL72 rack profiles) through the
same `modelSystemPower` path the chart uses, so article figures match chart hovers;
`metadata.pue_override` records an explicit `--pue`, which then applies to every
row, and `metadata.pue_defaults` records the per-hardware defaults. NVL72 rows also
carry `measured_basis`, `sensor_kind`, the Grace-socket and module measured inputs
under their own `cpu_power_valid`, the rack profile's `model_path` and assumptions,
and rack-specific `calculation_boundary` / `extrapolation_note` text; x86 rows are
unchanged.

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
The JSON includes original input rows, measured validity, modeled outputs,
assumptions, audit windows, and source provenance. CSV includes separate measured
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

PowerX 的系统功耗结果以实测 GPU 功率为输入，使用固定版本的功耗模型估算
8-GPU 机箱的 AC 输入功率，再单独应用 PUE 得到设施功率估计。CPU 和 DRAM 利用率
均假设为 20%；这些是模型参数，不是实测利用率。完整平台配置、源码版本和校验和
随导出结果保留。模型源码仍标记为待人工核验，数值一致性不代表完成了实机校准。

固定版本的 Python 模型默认 PUE 为 1.2；PowerX 对当前风冷机箱模型
采用 1.3。市电侧功率 = IT 负载功率 × PUE，风冷取 1.3，直接液冷（DLC）
取 1.1。PUE 仅作用于机箱交流功率，不改变 GPU 实测功率或机箱交流功率。这里的
冷却方式指建模机箱，并非已核实的测试站点配置。机箱模型不支持 DLC；`--pue` 仅
覆盖设施功率系数，不会把风冷机箱模型转换为液冷模型。NVL72 机架 profile 为直接
液冷，默认 PUE 取 1.1。

仅使用部分 GPU 的机箱（单台主机上实测 1–7 张 GPU）按实测每卡功率 × 8 建模，
与模型源码 sweep 脚本喂给各机箱模型的 `n_gpu × W/GPU` 输入一致，并假设未实测的
GPU 运行相同负载。结果标记为 `chassisBasis: 'extrapolated'`：每卡数值按建模机箱
的 GPU 总数分摊，`deploymentAcWatts` 只保留实测 GPU 在各机箱中的份额。这不是把
部分分配的机箱按比例分摊：固定组件、风扇曲线和 PSU 效率都在满机箱负载点求值。
GB200、GB300 使用单独的 NVL72 机架 profile，不套用 B200、B300 机箱模型：每台实测
worker 主机视为一个计算 tray（4 张 GPU、2 个 Grace socket）；没有逐 worker 数组的聚合
多节点行则按 GPU 总数 ÷ 4 推算 tray 数、每个 tray 取部署平均值，并与 Grace socket 数及
CPU 采集记录的 `power_audit.cpu.observed_sockets` 交叉校验。输入为实测模块功耗
（`avg_total_module_power_w`）；缺失时改用 GPU 板卡功耗加 Grace socket 功耗
（`avg_total_cpu_power_w`），并按来源模型计入 GPU 份额的稳压损耗余量。Grace CPU 与
LPDDR5X 从不建模，缺少 `cpu_power_valid=1` 和 Grace 侧指标的行保持不可用
（`cpu-telemetry`）。实测的各 tray 先折算为一个由 18 个与其均值相同的 tray 组成的
整机架，电源架效率曲线只在该机架的直流总负载处求值一次（与来源模型
`gb200_nvl72_rack_power` 只接受单一 per-tray 输入的做法一致），每个 tray 取其 1/18，
因此 NVSwitch tray、电源架和管理交换机按 72 张 GPU 分摊；机箱则各自拥有风扇和 PSU，
仍按各自负载单独求值。部分分配的 tray 只外推 GPU 板卡份额（模块读数本身已覆盖整个
tray），并标记为 `extrapolated`。缺失、无效和不支持的情况保持不可用。纯 CPU frontend
worker 不计入 GPU 机箱数；独立的纯 CPU frontend/router 主机不在估算范围内，GPU 机箱内
的 CPU 功率仍按 20% 利用率计算。

导出时每次测量先独立计算，再对同一 cell 的重复测量取平均。能耗使用审计记录中的
实际窗口和成功 token 数，按实测 GPU 的份额计算，明确标记为估计值，不改写原有
GPU 实测指标。当前 API 快照与原文章冻结数据分别导出，避免混用不同时间和配置的
结果。未指定 `--pue` 时，每行按其硬件采用与仪表板相同的默认 PUE（风冷机箱 1.3，
液冷 NVL72 机架 1.1），因此文章数据与图表悬停一致；显式 `--pue` 记录在
`metadata.pue_override` 中并覆盖所有行。NVL72 行另附实测口径、传感器类型、
按 `cpu_power_valid` 保留的 Grace socket 与模块实测输入、机架 profile 及其假设，
以及机架专用的边界与外推说明；x86 行保持不变。

**NVL72 机架估算（GB200、GB300）。** 实测输入：每个计算 tray 使用实测的计算模块功耗，
Grace CPU 与 LPDDR5X 从不建模。生产端的 CPU 功耗采集（srt-slurm，ACPI hwmon）在与
GPU 能耗相同的正式窗口内输出 `avg_cpu_socket_power_w`、`avg_total_cpu_power_w`、
`total_cpu_energy_j`，当每个 socket 都有 `Module Power Socket` 传感器时还输出
`avg_total_module_power_w` 与 `total_module_energy_j`，并附带独立的验证结论
`cpu_power_valid` 和 `power_audit.cpu`（传感器类型、采集来源、socket 覆盖情况、原因码）。
接纳条件：`power_valid=1`、schema 2、`cpu_power_valid=1`、Grace 功耗为正，且
`avg_total_cpu_power_w / avg_cpu_socket_power_w` 等于每 tray 两个 socket。存在
`avg_total_module_power_w` 时采用 `module` 口径（读数已包含 GPU 板卡，不再缩放），
否则采用 `gpu-plus-grace` 口径（每 tray GPU 板卡功耗 × 4 加 Grace socket 总功耗，
并仅对 GPU 份额计入来源模型的稳压损耗余量）。模块指标存在但无效时该行不可用
（`cpu-telemetry`），不会悄然回退到 Grace socket。

建模残差：计算模块之外的部分全部来自固定版本 profile（`rackProfiles`），按实测 tray
均值构成的 18 tray 整机架求值一次（电源架曲线看到的是整机架直流负载，而非单个
tray），再分摊到 72 张 GPU：NVSwitch tray 硅片功耗（9 个 tray，
`blackwell_nvswitch` 模型，`u_nvlink` 0.5）及 tray 残差（50 W，UNVERIFIED）；每个计算
tray 的网卡与光模块（GB200 为 ConnectX-7，4 × 31.5 W；GB300 为 ConnectX-8，4 × 78.8 W）、
BlueField-3 DPU 空闲功耗（2 × 65 W）、NVMe 空闲功耗（22 W）、风扇（130 W，UNVERIFIED）
和主板残差（40 W，UNVERIFIED）；2 台管理交换机（各 100 W）；tray 内 50 V → 12 V 转换
效率 0.9725（UNVERIFIED）；电源架装机容量 264 kW、冗余容量 132 kW，效率曲线在 10%/20%/30%
负载处为 0.90/0.94/0.965；液冷 PUE 1.1，仅对机架交流功率应用一次。机架直流功率超过电源架
装机容量（264 kW）时该行不可用（`model-domain`）。舍入与来源一致：机架交流功率先四舍五入到 0.1 W
再乘 PUE；Python 生成的 `rackCases` 对两种变体、两种口径、全部电源架拐点和 PUE 1.0–1.2
验证了与固定实现的一致性。

门槛规则（利润估算器）：规划 kW/GPU = 部署设施功率 ÷ 实测 GPU 数 ÷ 1000 × 1.1。接受
`chassisBasis: 'full'` 的八卡机箱估算（`single-node`、`worker-hosts` 或 `uniform-hosts`
拓扑），或全部 tray 均完整实测的 `nvl72-trays` 估算（各 4 张 GPU、2 个 socket：每个实测
worker 主机一个 tray，或没有逐 worker 数组的聚合多节点行按 GPU 总数 ÷ 4 推算、并与
socket 数交叉校验）；部分 tray 在图表中外推显示，但与部分机箱一样不进入规划门槛。两个前沿数据点之间必须采用相同的实测口径和传感器类型，模块
读数旁边的 Grace socket 读数保持不可用，不会混合两种传感器。柱形提示、功耗说明下方的
标注行和 CSV 的 `功耗口径`、`功耗传感器`、`系统功耗 profile` 三列逐行标出实测口径
（实测模块功耗，或实测 GPU 板卡 + Grace socket 功耗并由模型估算稳压损耗）、传感器类型
和所用 profile（`modelPath @ modelRevision sha256:<源文件哈希>`）。`?unofficialrun=`
叠加层规则不适用于利润估算器的功耗口径控件：估算器只对正式前沿数据点定价。

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
