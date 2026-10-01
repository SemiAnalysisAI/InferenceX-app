# PowerX system power and smart provisioning

[English](./powerx-system-power.md) | [简体中文](./powerx-system-power.zh.md)

Use this guide to inspect measured curves, estimate system power, and compare
capacity under a fixed facility power budget. Start with [the dashboard steps](#inspect-a-measured-curve),
then use [the hardware requirements](#hardware-and-telemetry-requirements) or
[troubleshooting](#when-a-curve-or-estimate-is-missing) when a result is unavailable.

The system model is **DRAFT / pending human verification**. Its regression
fixtures establish numerical consistency, not empirical calibration. AgentX
estimates, including Kimi K3, are planning previews; they do not establish AgentX
calibration or safe peak-load provisioning.

## Choose the power boundary

| Dashboard boundary          | What the value represents                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| GPU Level Measured          | Validated GPU-board power during the benchmark window.                                               |
| GPU Level Provisioned (TDP) | Hardware TDP; a reference, not a reading from this run.                                              |
| All in Provisioned          | The hardware registry's fixed facility kW/GPU allowance.                                             |
| All in Measured             | Measured inputs plus modeled system components and facility overhead. It is not measured wall power. |

The examples below use W per GPU and J per output token. GPU measurements remain
available independently of whether the system model can accept the row. Measured
P75/P90 values are time-weighted percentiles of synchronized fleet GPU power,
divided by GPU count; neither the average nor individual-device percentiles
substitute for them.

## Inspect a measured curve

**Prerequisites:** a benchmark selection with retained power data. Unlock the
experimental power controls with ↑↑↓↓ if they are hidden.

1. Open `/inference`, select the model (for example, Kimi K3), workload, date/run,
   engine, precision, and hardware. Keep those selections fixed when comparing
   boundaries; different engines or historical runs are different curves.
2. Choose a measured-power metric and **GPU Level Measured**. Use **Table** to
   inspect numeric rows and select a chart point to inspect its measurement
   provenance. Start with average W/GPU: energy also requires a valid token
   denominator, and P75/P90 require retained percentile measurements.
3. Switch to **All in Measured** to inspect facility estimates. This boundary
   supports 8K/1K single-turn results and AgentX previews. The separate
   **Modeled Chassis AC** metric remains limited to 8K/1K single-turn results.
4. For a capacity comparison, open `/profit-estimator-per-gigawatt`, choose the
   model and a supported interactivity target, then select **Compare both** in
   Benchmark Config. Match each result's workload, engine and precision to the
   inference selection. Expand **Unavailable estimates** for missing results;
   hover or select a bar for its power basis and read the formula notes below.

**Expected result:** the inference table includes rows with a valid selected
metric, including supported B200/H200 multi-node deployments. Selecting All in
Measured does not include every valid GPU measurement: it also requires the
inputs below. The Profit Estimator adds target-range and financial requirements
and uses only official frontier points. Inference charts and tables also
support unofficial-run overlays.

## Hardware and telemetry requirements

| Hardware / deployment                                       | System estimate requires                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H100, H200, B200, B300, MI300X, MI325X, MI355X              | Valid GPU-board telemetry; an eight-GPU chassis profile models CPU, DRAM, networking, storage, board, fans and PSU losses.                                                                                                |
| B200/H200 and other supported chassis across multiple hosts | Consistent GPU counts and watts. Per-worker data must identify one chassis per distinct host. Aggregate non-disaggregated rows without workers may use complete eight-GPU hosts at the deployment mean (`uniform-hosts`). |
| Prefill/decode disaggregation                               | Per-worker host placement and role power consistent with deployment totals. A role average alone cannot establish each host's load. Separate CPU-only frontend/router hosts are outside the estimate.                     |
| GB200 / GB300 NVL72                                         | Valid GPU telemetry **and** complete, independently valid compute-module or Grace-socket telemetry from the same window: four GPUs and two sockets per compute tray.                                                      |

The normal contract is numeric `power_valid=1`,
`power_metric_schema_version=2`, positive `avg_power_w` (W/GPU) and
`avg_total_gpu_power_w` (deployment W), and a consistent physical GPU count.
The model retains a legacy validated single-node exception with no schema
marker as `validated-unversioned-single-node`; this does not admit unversioned
multi-node, disaggregated or NVL72 rows. Profit planning always requires schema 2.

**NVL72 sensor boundary:** `cpu_power_valid=1` and `power_audit.cpu` must record
matching expected/observed socket counts, two per tray. Either:

- `avg_total_module_power_w` with `sensor_kind: module` covers GPU, HBM, Grace
  and LPDDR5X together. Do not add GPU or Grace watts again.
- `avg_total_cpu_power_w` and `avg_cpu_socket_power_w` with
  `sensor_kind: grace_socket` must agree with the socket count. The model adds
  GPU-board power and a regulator allowance of GPU W × 0.15 / 0.85.

CPU-rail-only, missing or unknown sensor provenance is insufficient. A present
but invalid module measurement remains unavailable; it does not silently fall
back to Grace readings. Model support does not imply that every producer version
collects these fields.

**Partial allocations:** a one-to-seven-GPU chassis is modeled as eight GPUs at
the measured per-GPU load and labeled `extrapolated`. Deployment totals retain
only the measured GPUs' share. Profit planning accepts single-node 1/2/4-GPU
chassis allocations as whole-replica extrapolations, assuming co-location leaves
performance and power unchanged. Other partial layouts, including partial NVL72
trays, are not accepted for profit planning. A module sensor already covers its
whole tray, so that reading is never scaled to fill unmeasured GPUs.

## One worked NVL72 example

**Input:** the [GB300 reference fixture](../packages/app/src/lib/system-power-model.reference.json)
with **3,000.75 W of module power per complete tray** and PUE 1.1.
This is a numerical fixture, not a measured Kimi K3 result. An actual benchmark
must separately satisfy both GPU and CPU/module validation.

1. Scale the measured mean module input to 18 compute trays. Add modeled tray
   components, nine NVSwitch trays, conversion losses and management switches.
2. Evaluate the power-shelf efficiency once at the combined rack load. Every
   measured tray receives the same 1/18 rack share; this assumes the remaining
   trays run at that mean load, rather than measuring actual rack occupancy.
3. Apply PUE once to rack AC power, then divide by 72 GPUs.
4. Apply the separate 10% planning reserve for the Profit Estimator.

| Stage                                           |    Watts |
| ----------------------------------------------- | -------: |
| Module input × 18 trays                         | 54,013.5 |
| Modeled compute-tray components                 | 11,466.0 |
| Modeled NVSwitch trays                          |  4,107.6 |
| Tray conversion losses                          |  1,967.8 |
| Rack DC, including 200 W of management switches | 71,754.9 |
| Rack AC, after shelf losses                     | 74,904.6 |
| Facility power after PUE 1.1                    | 82,395.1 |

```text
Planning kW/GPU = 82,395.1 / 72 / 1,000 × 1.10 ≈ 1.258814
GPU capacity per GW = 1,000,000 / 1.258814 ≈ 794,399
GPU-hours per GW-year = GPU capacity × 8,760
```

An eight-GPU benchmark on two complete trays receives
82,395.1 × 8 / 72 ≈ 9,155.0 W of facility power, giving the same per-GPU result.
It has not measured all 72 GPUs. Intermediate values are rounded; summing the
displayed components can differ by 0.1 W. Planning uses the retained facility
total, not the fixture's rounded per-GPU display value.

## Assumptions behind the estimate

- **PUE:** the dashboard applies 1.3 to air-cooled chassis and 1.1 to NVL72,
  after AC conversion losses. The historical profile default of 1.2 is not the
  dashboard default. Cooling describes the model, not verified site cooling.
  Changing PUE does not convert an air-cooled chassis model into a DLC model.
- **Chassis overhead:** coefficients reflect fixed assumptions of 20% CPU/DRAM
  utilization, 5% PCIe utilization and idle NVMe. These are not live utilization
  readings. Each host's nonlinear fan/PSU model is evaluated at its own load;
  `uniform-hosts` explicitly substitutes the deployment mean for every host.
- **NVL72 overhead:** Grace and LPDDR5X are measured. Rack networking, switches,
  fans, board residuals, conversion losses and power shelves are modeled.
  [Profiles](../packages/app/src/lib/system-power-model.profiles.json) retain
  component values, source status and ranges for unverified parameters. Rack DC
  above the 264 kW installed shelf capacity is outside the model domain.
- **Planning reserve:** facility kW/GPU × 1.10 is a separate capacity buffer.
  Average power plus this reserve is not a validated electrical peak limit.
- **Matched comparison:** profit modes keep the same original performance
  frontier, target, token prices, utilization, license share and per-GPU-hour
  costs. Between frontier points, planning power is interpolated only between
  those original points, with compatible model revision, PUE, topology and sensor
  basis. No extrapolation or replacement by another power-valid point occurs.

Lower planning power increases GPU capacity per GW. Revenue, compute cost and
license fees scale with that capacity under the fixed per-GPU assumptions; profit
margin and per-chip-hour economics do not improve. Electricity expense is not
recomputed separately.

## When a curve or estimate is missing

Compare the same model, workload, date/run, engine, precision and metric first.
Chart/table rows and target-based profit estimates answer different questions.

| Symptom / reason                                                           | Check and next action                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GPU curve exists, All in Measured is absent                                | Check supported workload/hardware and the row's system-model status. Valid GPU power alone does not establish a system estimate.                                                           |
| B200/H200 multi-node row is absent (`topology`, `role-power`, `gpu-count`) | Inspect physical GPU count, host placement and total/role watts. Use the original producer topology; do not infer chassis placement from a display label or sum TP/EP aliases.             |
| NVL72 reports `cpu-telemetry` / `no-cpu-power`                             | Inspect the same-window CPU audit, sensor kind and complete socket coverage. GPU validity remains independent.                                                                             |
| `telemetry` / `no-measured-power`                                          | Check the original validation audit and raw samples. Reprocess only when the retained evidence supports the original window; otherwise collect replacement performance and power together. |
| `outside-measured-range` or power-invalid target bracket                   | Choose a target supported by the selected serving curve. Both original bounding points need valid power; another valid point elsewhere on the curve cannot fill the gap.                   |
| `incompatible-power-basis`                                                 | Do not interpolate between module and GPU-plus-Grace readings, or different model/PUE bases.                                                                                               |
| No cost, token mix or provisioned power                                    | Inspect the financial inputs. This can prevent both profit estimates even when power is valid.                                                                                             |
| `workload`, `hardware`, `model-domain`                                     | Use a supported workload/profile and in-domain input; do not replace the missing estimate with zero or TDP.                                                                                |

In **Compare both**, a valid provisioned result remains when its measured estimate
is unavailable. Configurations that cannot be priced at all are listed separately
from missing measured estimates. Measured-only mode never substitutes provisioned
watts. See [persistence and recovery](./powerx-persistence-recovery.md) for retained
telemetry and targeted repair; new power readings cannot be attached to old
throughput results.

## Provenance and reproducible exports

Inspect the point's measurement source and the estimate's model revision, PUE,
sensor basis and topology. Profit tooltips identify the power basis; formula
notes and CSV columns `Power basis`, `Power sensor` and `System power profile`
provide the assumptions and source details.
The model revision is an `app-sha256:` digest, not a benchmark run ID or Git commit.

The [offline exporter](../packages/app/scripts/export-modeled-system-power.ts)
accepts a local `ComparisonInput` envelope with original `BenchmarkRow` entries,
metadata, and optional original artifacts/audits. Use the script's type for the
complete shape; preserve run, attempt, producer revision, capture time and hashes.
The exporter follows the ordinary 8K/1K model policy, not the AgentX preview opt-in.
Run from the repository root with installed dependencies and a new output path:

```sh
bun packages/app/scripts/export-modeled-system-power.ts \
  --input /path/to/cohort.input.json \
  --output /path/to/new-comparison
```

Outputs are `comparison.json`, `comparison.csv` and optional `cells.csv`. JSON
retains original rows, audits, validity, model outputs and provenance; unavailable
CSV values stay blank. Optional `--pue 1.3` overrides the facility factor for
**every** row and is recorded in metadata. Without it, per-hardware defaults apply.
See [API examples](./inferencex-api-examples.md) for measured-data extraction.

Modeled energy requires a matching audit with exact telemetry duration, physical
GPU count and successful request/token denominators. It is modeled deployment
power × duration, not integrated measured wall energy. No kernel-level
prefill/decode energy is inferred. Each replicate is modeled before aggregation;
a cell mean remains unavailable if any scoped replicate is unavailable.

## Maintain the model

| Responsibility                                      | Source                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Equations, nonlinear curves and rounding            | [system-power-model.ts](../packages/app/src/lib/system-power-model.ts)          |
| Component parameters, assumptions and source status | [profiles](../packages/app/src/lib/system-power-model.profiles.json)            |
| Workload, telemetry, topology and PUE admission     | [modelSystemPower](../packages/app/src/lib/modeled-system-power.ts)             |
| Matched frontier and planning reserve               | [profit-power.ts](../packages/app/src/components/calculator/profit-power.ts)    |
| Frozen numerical baseline                           | [reference fixtures](../packages/app/src/lib/system-power-model.reference.json) |
| Model identity and source hashes                    | [provenance](../packages/app/src/lib/system-power-model.provenance.json)        |

Edit equations or active coefficients together with justified expected values and
assumption metadata. Changing labels such as `u_cpu` alone does not change watts.
Refresh and check the manifest:

```sh
bun packages/app/scripts/update-system-power-provenance.ts
bun packages/app/scripts/update-system-power-provenance.ts --check
```

Run affected model, admission, planning, views API and export checks. Keep the
496 historical reference cases frozen; baseline parity does not establish
calibration. The app owns the model and parameters; no private Python repository
is required. Historical measurements are modeled on read, so a model-only change
needs an updated app bundle and API cache refresh/expiry, not a raw-data backfill.
Regenerate frozen exports separately; missing source measurements remain missing.
