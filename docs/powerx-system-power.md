# Modeled system power in PowerX

PowerX compares measured GPU-board watts with modeled IT and facility watts for
`single_turn` rows at every input/output length and for AgentX
(`agentic_traces`) rows. The chart transformation, the views API, the Profit
Estimator, and the offline article exporter all call `modelSystemPower`; the
benchmark producer and the raw benchmark API keep returning the original
measurements.

The model is the `power_model` package in SemiAnalysisAI/InferenceX
(GPL-3.0-only, labeled "Beta Experimental" upstream), ported module for module to
`packages/app/src/lib/power/power_model/`. The
[power model sync rule](../AGENTS.md#power-model--ts-port-and-upstream-python-must-stay-in-sync)
in AGENTS.md covers the port, its manifest and its parity test. Numerical parity establishes
implementation equivalence, not empirical chassis calibration. Where upstream raises
`ValueError` (for example above the modeled PSU or power-shelf capacity), the estimate is
unavailable with `reason: 'model-domain'`. Any other error is a defect and propagates.

## Operating state

The upstream model takes a workload state and a scale-out flag. `modelSystemPower`
derives both from the row and its resolved chassis topology, and records them on
the supported estimate as `operatingState`; the system-power tooltip shows them.

`single_turn` rows use `fixed-seq-len`, `agentic_traces` rows use `agentic-cpu-offloading`
when KV offload is enabled and `agentic` otherwise, and any other benchmark type is
unavailable (`reason: 'workload'`).

Every offload tier other than `none` counts as enabled, so NVMe-only offload also
maps to `agentic-cpu-offloading`. Scale-out is on for disaggregated rows, for rows
modeled on more than one chassis or more than one NVL72 rack (19 or more compute
trays), and for a Mooncake KV store (`kv_offload_backend: 'mooncake'`), which
moves KV over the RDMA NICs even on one node. Compute trays inside one rack share
its NVLink domain, so spanning trays of one rack does not by itself turn it on.
Scale-out switches the NICs and the network share from idle to active power.

## Updating the model for historical results

Modeled power is derived from retained measurements when the browser or a shared
views API transforms a benchmark row. Changing the model does not rewrite the
original GPU measurements or require a per-run database backfill.

1. Port the upstream change module for module, map any new upstream system in
   `system-power-model.ts`, and regenerate the manifest and parity fixture as the
   [power model sync rule](../AGENTS.md#power-model--ts-port-and-upstream-python-must-stay-in-sync)
   and the `packages/app/scripts/generate-power-model-parity.py` docstring describe.
2. Run `src/lib/power/power-model-parity.test.ts` and the admission tests: a
   missing or extra module, or any numerical or error difference, fails. Then
   deploy the app. Existing browser sessions need the updated bundle. Derived
   API responses need the normal authenticated cache invalidation or cache
   expiry; deployment alone does not establish that every cached response uses
   the new revision.
3. Regenerate frozen CSV/JSON exports separately. If the revised model needs
   inputs that were never recorded, those rows stay unavailable until the input
   gap is resolved. A new benchmark's power must not be attached to an older
   benchmark's throughput.

## Per-point breakdown

A supported estimate also carries `deploymentBreakdownWatts`, the same deployment watts split
by component class, in the stack order PowerX draws them. `breakdownPowerEstimate` in
`system-power-model.ts` sums the pinned model's leaf components by name
(`systemPowerLeafCategory`): `GPUs` is `gpu` (measured), `Grace socket (measured)` is
`measuredCpu`, `X86CPU` / `GraceCPU` are `cpu`, `DDR5DIMM` / `LPDDR5XMemory` are `memory`, NIC
cards and system-side transceivers are `nic`, NVSwitch ASICs plus the NVL72 switch tray's
embedded EPYC are `nvswitch`, `NVMeDrive` is `storage`, PCIe switches, retimers and the shelf
controller are `other`, fan components are `fans`, AC/DC, DC/DC and generic conversion losses are
`psuLoss`, and everything under `Scale-out networking` is `network`. `facility` is the model's
PUE overhead. A measured Grace socket covers CPU + LPDDR, so NVL72 rows with socket telemetry
carry no `cpu` or `memory` part; AMD chassis carry no `nvswitch` part and the B300 chassis no
`other` part. Extrapolated chassis
attribute each part by the same measured-GPU share as `deploymentFacilityWatts`, so the parts
always sum to it, and divided by allocated GPUs they sum to All in Measured W/GPU. The leaf
names are the pinned port's; `system-power-model.test.ts` pins the full leaf → part table across
every supported system, so a renamed upstream component (which would land in `other`) fails it.

## Boundary and assumptions

The input is measured mean GPU power during a validated serving window. Modeled
IT power adds the upstream model's board, CPU, DRAM, NIC, storage, PCIe switch,
transceiver, fan, and PSU-loss estimates for the operating state, plus the
chassis share of the scale-out switches. Facility power applies the system's
PUE once, after IT power (1.3 for the air-cooled chassis, 1.1 for the liquid-cooled NVL72
racks). Measured GPU power does not change. Cooling describes
the modeled chassis, not verified benchmark-site cooling. These are model
inputs, not measured CPU, DRAM, or network utilization.

The chassis profiles describe a complete eight-GPU chassis. GB200 and GB300 are
rack-scale systems upstream and use their own rack profiles; their topology is
never substituted with B200 or B300.

### NVL72 racks

GB200 and GB300 NVL72 rows pass the same GPU contract. Their Grace sockets are
measured when the same validated window also passes a Grace-side check:

- `cpu_power_valid=1`, a verdict independent of `power_valid`.
- `power_audit.cpu.sensor_kind: 'grace_socket'` with matching `expected_sockets`
  and `observed_sockets`.
- Positive `avg_total_cpu_power_w` (sum over sockets) that equals
  `avg_cpu_socket_power_w` (mean per socket) × sockets within producer rounding.
- The socket count equals trays × 2.

Otherwise the rack model's own Grace CPU and LPDDR5X profile for the operating
state stands in for the sockets. The estimate records which with `cpuBasis:
'measured' | 'modeled'` (`measuredGraceSocketWatts` is null when modeled); the
tooltip, Profit Estimator and export label it, and the Profit Estimator never
interpolates between a measured-Grace and a modeled-Grace knot. The CPU rail
alone (`dcgm_cpu_rail`) omits SysIO and LPDDR5X. A `module` audit names only
the headline sensor, so it does not establish which sensor fed the Grace-side
keys, and `power_model` has no module input; such rows use the modeled sockets.
Module keys stay stored as data. The topology resolves to four-GPU compute
trays: one tray per measured worker host, or GPU count ÷ 4 trays at the
deployment mean for an aggregate multinode row without workers.

NVL72 rows are evaluated with `estimateRackPower` against the upstream rack model of 18
identical compute trays, 9 NVSwitch trays and 8 power shelves. A tray above its 48 V
converter capacity, or a rack bus that does not fit the 4 surviving shelves and the PSU
curve, is unavailable (`reason: 'model-domain'`).

NVIDIA defines the
socket sensor only as "Power of Grace socket"; upstream treats it as the CPU and
SysIO rails, LPDDR5X, and socket regulation (see the `power_model` README), so it
replaces the modeled Grace CPU and LPDDR5X; nothing is added on top of either input. GPU
board telemetry already includes the GPU module's own regulation. Tray fans still
take the modeled LPDDR5X heat as air heat, as upstream does.

Upstream takes one W/GPU and one W/socket for the whole rack. The measured trays
are therefore folded into a rack of identical trays at their mean full-tray GPU
input and the measured mean socket, and each tray takes 1/18 of the rack's IT
and facility power. Prefill and decode trays share that one evaluation. A
partially measured tray is extrapolated to four GPUs at its measured per-GPU
power, as for chassis.

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
