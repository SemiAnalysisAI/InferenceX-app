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
with B200 or B300. Partial allocations, missing or invalid telemetry, inconsistent
counts, missing host placement, and model-domain overflow remain unavailable.

For a single-node deployment, the producer's physical width is `TP * PP * PCP`.
EP partitions that width. Some existing API configuration aliases contain
`TP * EP`; the model cross-checks the physical width against measured total and
per-GPU watts instead of trusting or summing those aliases. Multi-node and
disaggregated inputs require one complete chassis per measured worker, distinct
worker hosts, and consistent total/role watts. A role average alone cannot
establish physical placement or evaluate each host's nonlinear model. CPU-only
frontend workers are excluded from GPU-chassis counting. Separate CPU-only
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
denominators. It is modeled average power multiplied by that duration, not a
time integral of measured wall power. Actual output-token counts are used;
nominal `1024` tokens per query never replace recorded counts. No kernel-level
prefill/decode energy is inferred. API snapshots without these sidecars receive
power estimates only.

Each replicate is modeled before aggregation. A cell mean averages its modeled
replicate outputs; it does not evaluate the model at mean watts. If any replicate
is unavailable, the corresponding mean remains unavailable rather than silently
dropping that replicate.

## First-article evidence package

The delivered package keeps three distinct complete cohorts:

1. Original Qwen3.5 campaign: 48 cells and 144 replicates across six hardware
   configurations. All 24 H200 replicates have recovered original telemetry,
   audit receipts, exact timing/token counts, and verified producer checkout
   `bf4461db65ac7d8351d720b302aadac4f0de8f78`. B200, B300, and MI355X used
   four-GPU allocations and remain unsupported for chassis attribution; GB200
   and GB300 lack matching models. Original measured inputs remain intact.
2. Current published Qwen snapshot: every scoped row, separately identified by
   the saved API response, retrieval time, and checksum.
3. Current DeepSeek-V4 snapshot: separate integration coverage, not a replacement
   for the original article's Qwen measurements.

The saved package includes `prepare-comparison-inputs.ts`, its original source
responses/receipts, and the three normalized input envelopes. Run that preparation
script from the selected app checkout, then run the exporter for each envelope.
The script uses the existing ETL normalizer and checks all original measurement
fields against the frozen source. No new GPU experiments or article rewrite are
part of this integration.

## 中文说明

PowerX 的系统功耗结果以实测 GPU 功率为输入，使用固定版本的 Oren 模型估算完整
8-GPU 机箱的 AC 输入功率，再单独应用 PUE 得到设施功率估计。CPU 和 DRAM 利用率
均假设为 20%；这些是模型参数，不是实测利用率。完整平台配置、源码版本和校验和
随导出结果保留。模型源码仍标记为待人工核验，数值一致性不代表完成了实机校准。

原文章的 144 次测量全部保留。24 次 H200 测量具有完整的原始审计材料，可计算
机箱功率及能耗估计；4-GPU 的 B200、B300、MI355X 配置不能直接按半台机箱分摊，
GB200、GB300 也不能套用 B200、B300 模型。缺失、无效和不支持的情况保持不可用。
纯 CPU frontend worker 不计入 GPU 机箱数；独立的纯 CPU frontend/router 主机不在
估算范围内，GPU 机箱内的 CPU 功率仍按 20% 利用率计算。
每次测量先独立计算，再对三次重复测量取平均。能耗使用审计记录中的实际窗口和
成功 token 数，明确标记为估计值，不改写原有 GPU 实测指标。当前 API 快照与原文章
冻结数据分别导出，避免混用不同时间和配置的结果。
