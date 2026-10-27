---
title: 'PowerX tutorial: how we measure and model inference power'
description: 'What PowerX measures, what it models, how to read each chart, and how to collect power in your own InferenceX run.'
updated: '2026-10-27'
---

PowerX shows how much power each accelerator draws while it serves a benchmark, and how much energy each token costs. Every number starts from GPU telemetry sampled once a second during the benchmark's serving window. Everything that cannot be measured on the benchmark cluster is modeled and labeled as modeled.

## What PowerX measures

- **Per-GPU power, once a second.** NVIDIA clusters run `dcgm-exporter` on every node at a 1 s interval; AMD clusters run AMD's `device-metrics-exporter` at 1 s. The head node scrapes every node on one clock.
- **One window per benchmark point.** Each concurrency point has a serving window that starts after warmup and ends with the last request. Only samples inside that window count.
- **Energy by integration.** Energy per GPU is the trapezoid integral of its power samples over the window. Energy per token divides the whole deployment's GPU energy by the tokens the benchmark client counted (output, input, total, or per request).
- **Statistics across the fleet.** Average, P75, and P90 power are time-weighted over the window across all GPUs in the deployment. For prefill/decode deployments, role averages cover that role's GPUs over the same full window.

> [!NOTE]
> Measured watts and joules cover accelerator telemetry only: the GPU board on NVIDIA HGX systems, the GPU module on NVL72, and the GPU package on AMD. Host, network, cooling, and facility power are modeled, never measured, and PowerX always says which is which.

## Four ways to count power

The **Count** control picks the boundary. Pick the one that matches the question.

| Count       | What it includes                                                                                                | Source                                                          | Use it for                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| GPU only    | The accelerator the exporter reports                                                                            | Measured                                                        | Chip efficiency, J/token, % of TDP            |
| IT (no PUE) | GPU + CPU, memory, NICs, NVSwitch, storage, PCIe, fans, PSU loss, plus the chassis' share of scale-out switches | Measured GPU (and Grace sockets where available) + modeled rest | Data-center capacity: kW per GPU, GPUs per MW |
| Facility    | IT × PUE (1.3 for air-cooled chassis, 1.1 for liquid-cooled NVL72 racks)                                        | Modeled                                                         | Utility power and energy cost                 |
| All         | The three lines on one chart                                                                                    | Both                                                            | Seeing how much sits outside the GPU          |

**Rated boundaries** adds the vendor numbers for comparison: GPU TDP, and the all-in provisioned W per GPU that operators size racks with. Measured power at a typical decode point sits well below both.

> [!TIP]
> If you plan capacity, read **IT (no PUE)** at **P90**. If you compare chips, read **GPU only** on the energy-per-token view.

## Measured and modeled, by platform

| Platform                            | Measured                                                                                                                                         | Modeled                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| NVIDIA HGX (H100, H200, B200, B300) | GPU board power via DCGM (NVML sensor, including the module's own regulation)                                                                    | 2 CPUs, DRAM, NICs, PCIe switches, NVMe, fans, PSU loss                  |
| NVIDIA NVL72 (GB200, GB300)         | GPU module power via DCGM per compute tray; Grace socket power (CPU, LPDDR5X, and socket regulation) when the same window passes the Grace check | NVSwitch trays, tray fans, power shelves, and Grace when its check fails |
| AMD OAM (MI300X, MI325X, MI355X)    | GPU package power as reported by the AMD exporter                                                                                                | 2 CPUs, DRAM, NICs, PCIe switches, NVMe, fans, PSU loss                  |

The model is the open-source `power_model` package in the InferenceX repository, ported file for file into the app. It takes the measured per-GPU watts and a workload state (fixed sequence length, agentic, or agentic with KV offload) and returns chassis or rack IT and facility watts. Modeled numbers are computed when a chart is drawn, from the stored GPU measurements, with a pinned model revision; a model change updates every point at once and nothing is backfilled.

> [!IMPORTANT]
> AMD's exporter reports package power and NVIDIA's reports board or module power. The boundaries differ by the board-level regulation and components outside the package, so cross-vendor comparisons should say so. AgentX (agentic) points use the model's agentic state, which has not yet been calibrated against measured system power.

## Reading the charts

**Energy per token.** Joules per output token against interactivity (tok/s/user). Lower is better and the lines are Pareto frontiers, like the rest of the dashboard. This is the chip-comparison view.

**Power draw.** Watts per GPU against interactivity. Dots are measured points. The line is the upper envelope of a chip's points, not a frontier: raw watts have no "better" direction, and the envelope answers "what will this chip draw at this interactivity?" Switch **Power statistic** between Average, P75, and P90; planners use P90 because dynamic power steering reacts to peaks. The **headroom band** shows the gap to TDP, and the headroom table lists IT W per GPU and GPUs per MW at 25, 50, 100, and 300 tok/s/user.

**Where the power goes.** For the point under the slider, a stack of measured GPU power, the modeled parts, and facility overhead, with a list of every component, its watts, its share of IT, and how it moves across load. CPU, memory, and NICs are flat; fans and PSU loss follow the GPU.

**Over time.** The 1 s trace of the whole run with load swings: peak, minimum, idle floor, largest 1 s and 5 s steps, and ramp rate, per GPU or per NVL72 rack. Download it as CSV or JSON for grid and ramp questions.

> [!NOTE]
> Watts and joules answer different questions. A configuration can draw more watts and still use fewer joules per token when it serves more tokens per second, for example with speculative decoding or larger batches.

## Validated vs Historical

A point is **Validated** when its telemetry passed every check the offline validator re-runs from the raw samples:

- every expected GPU reported for the whole window;
- no gap between samples longer than 3 s;
- the serving window matches the benchmark client's window within 0.5 s or 1 %;
- the producer commit matches the pinned version and the exporter image hash is recorded;
- the token counts the energy is divided by are positive.

Anything else is **Historical**: the throughput still counts, but the point carries no energy metrics and is excluded from modeled IT and facility power. The audit record on each point lists the failing reason, the sample count, the largest gap, and the window bounds.

## Collect power in your own run

Power collection is part of every official InferenceX sweep, so a submitted recipe gets measured automatically. To run it yourself:

1. In the InferenceX matrix config, set `power: true` on a multi-node entry; single-node and AgentX jobs inherit the cluster's native exporter.
2. Set `require-power` (or `REQUIRE_POWER=1`) if an invalid measurement should fail the job instead of recording an invalid verdict.
3. Read the result: the aggregate JSON carries `power_valid`, `avg_power_w`, `p90_power_w`, and the `joules_per_*` metrics; the `power_audit_<result>` artifact holds `samples.csv`, the window files, and `power_validation_<result>.json`.
4. Pull published numbers with the API or the `inferencex powerx export` command from the `@semianalysisai/inferencex-skills` package.

## FAQ

**Why is measured power so far below TDP?** Decode-heavy inference is bound by memory and latency targets, not by compute, so the GPU rarely reaches its power limit. Prefill, video generation, and training sit close to TDP.

**Do DCGM and nvidia-smi disagree?** No. Both read the same NVML sensor, and the firmware already averages over roughly a second, which is why sampling faster than 1 Hz adds little. DCGM adds a daemon and an energy counter.

**Why P90 rather than average?** Capacity is provisioned for peaks. P90 is the power exceeded for 10 % of the window and is what a buffer should be added to.

**Why offer IT without PUE?** Data-center capacity teams size on critical IT kW per GPU. PUE depends on the site, so Facility applies it separately.

**What happens when the power model changes?** Nothing is stored. Every modeled number is recomputed from the stored GPU measurements with the pinned model revision, so an update changes every point at once and the revision is shown in the tooltip.

**Why does one point show Historical when the rest of the run is Validated?** Validity is per window. One lost sample or a clock mismatch invalidates that window only; the point keeps its throughput and loses its energy.

**Does a higher Facility number mean the site is less efficient?** No. PUE is a fixed model input per cooling type, not a measurement of the benchmark site.
