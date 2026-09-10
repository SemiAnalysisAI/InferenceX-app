# Modeled system power in PowerX

PowerX can compare measured GPU-board watts with estimated chassis AC watts for
the non-agentic 8192-input/1024-output workload. The existing app transformation
and the offline article exporter both call `modelSystemPower`; the API and
benchmark producer continue returning their original measurements.

`system-power-model.profiles.json` records the pinned Oren model revision,
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
and `u_nvme=0.0`. PUE defaults to `1.2`. Platform-specific network assumptions,
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

All listed profiles describe a complete eight-GPU chassis. GB200 and GB300 have
no matching model and are unsupported. Their rack topology is not substituted
with B200 or B300.

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

## Offline comparison export

The exporter reads a local cohort envelope and writes a **new** output directory:

```sh
bun packages/app/scripts/export-modeled-system-power.ts \
  --input /path/to/original-qwen-article.input.json \
  --output /path/to/new-original-qwen-comparison

bun packages/app/scripts/export-modeled-system-power.ts \
  --input /path/to/qwen35-current.input.json \
  --output /path/to/new-current-qwen-comparison --pue 1.2
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

PowerX 的系统功耗结果以实测 GPU 功率为输入，使用固定版本的 Oren 模型估算
8-GPU 机箱的 AC 输入功率，再单独应用 PUE 得到设施功率估计。CPU 和 DRAM 利用率
均假设为 20%；这些是模型参数，不是实测利用率。完整平台配置、源码版本和校验和
随导出结果保留。模型源码仍标记为待人工核验，数值一致性不代表完成了实机校准。

仅使用部分 GPU 的机箱（单台主机上实测 1–7 张 GPU）按实测每卡功率 × 8 建模，
与模型源码 sweep 脚本喂给各机箱模型的 `n_gpu × W/GPU` 输入一致，并假设未实测的
GPU 运行相同负载。结果标记为 `chassisBasis: 'extrapolated'`：每卡数值按建模机箱
的 GPU 总数分摊，`deploymentAcWatts` 只保留实测 GPU 在各机箱中的份额。这不是把
部分分配的机箱按比例分摊：固定组件、风扇曲线和 PSU 效率都在满机箱负载点求值。
GB200、GB300 没有匹配模型，也不能套用 B200、B300 模型。缺失、无效和不支持的
情况保持不可用。纯 CPU frontend worker 不计入 GPU 机箱数；独立的纯 CPU
frontend/router 主机不在估算范围内，GPU 机箱内的 CPU 功率仍按 20% 利用率计算。

导出时每次测量先独立计算，再对同一 cell 的重复测量取平均。能耗使用审计记录中的
实际窗口和成功 token 数，按实测 GPU 的份额计算，明确标记为估计值，不改写原有
GPU 实测指标。当前 API 快照与原文章冻结数据分别导出，避免混用不同时间和配置的
结果。

## Measured P90 GPU power

`y_measuredP90Power` shows the time-weighted P90 of synchronized fleet GPU-board
power over the validated load window, divided by GPU count. It shares the regular
measured-power chart path for official points and unofficial overlays. Missing or
unvalidated P90 remains unavailable; average power is never used as a substitute.
This metric is separate from modeled chassis AC power and individual-device P90.
