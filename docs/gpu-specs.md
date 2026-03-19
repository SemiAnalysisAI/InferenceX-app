# GPU Specs — Design Conventions

## Why These Specific Unit Conventions

- **Scale-up bandwidth is always unidirectional** (not bidirectional). Vendor spec sheets often quote bidirectional. We halve it for consistency because unidirectional is what matters for actual data transfer between a GPU pair.
- **TFLOPS are dense tensor core peak without sparsity**. Sparsity doubles theoretical FLOPS but real workloads rarely achieve structured sparsity. Dense values reflect realistic performance.
- **NIC naming is `{Model} {PortSpec}`** not `{PortSpec} {Model}` because the model name (ConnectX-7, Pollara) identifies the generation, which is more important for comparison. `GbE` suffix = Ethernet; plain `G` = InfiniBand (industry convention).

## Why NVL72 Systems Have No Scale-Out Topology

GB200 and GB300 NVL72 are rack-scale systems where all 72 GPUs are connected via NVLink domain. There's no "scale out" — the entire rack IS the compute unit. Scale-out would be connecting multiple NVL72 racks, which isn't a standardized topology yet. Fields are `null`, rendered as `N/A¹` with footnote.

## Scale-Out Topology Invariants

- **Leaf switches live inside the rail pod**, not at spine level. This is a common mistake in network diagrams. Servers → leaf (intra-pod) → spine (inter-pod).
- **Spine count = half of leaf count** when using the same switch model. This maintains a 2:1 oversubscription ratio, which is the standard non-blocking fabric design.
- **B200 is special**: Uses Google's gIB SKU with separate leaf (TH3) and spine (TH4) switch models, 4 pods of 4 servers instead of the usual 1-pod layout.
- **Dashed lines** = abstracted connections (one element representing many). Solid lines = explicit 1:1 connections.
- **Dual-port NICs** (2x prefix) draw 2 parallel lines to the leaf switch because each port is an independent network path.

## Scale-Out Topology Reference

| GPU                  | Servers/Pod | Pods | Leaf | Spine | Notes                               |
| -------------------- | ----------- | ---- | ---- | ----- | ----------------------------------- |
| H100/H200 SXM        | 32          | 1    | 8    | 4     |                                     |
| B200 SXM             | 4           | 4    | 4    | 2     | Google gIB SKU; separate leaf/spine |
| B300 SXM             | 32          | 1    | 8    | 4     |                                     |
| MI300X/MI325X/MI355X | 64          | 1    | 8    | 4     |                                     |
| GB200/GB300 NVL72    | —           | —    | —    | —     | No scale-out (NVLink domain only)   |

## Scale-Up Topology: Three SVG Layout Types

| Layout                     | Used By                                        | Why This Layout                                                                                        |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SwitchedTopologySvg`      | H100/H200 (4 switches), B200/B300 (2 switches) | NVSwitch-based: every GPU connects to every switch. Simple top-bottom bipartite graph.                 |
| `MeshTopologySvg`          | MI300X/MI325X/MI355X                           | AMD has no switches — GPUs connect directly in a full mesh. 8 GPUs = 28 lines. Uses AMD red `#ed1c24`. |
| `SwitchedNvl72TopologySvg` | GB200/GB300 NVL72                              | 72 GPUs can't be drawn individually. Node 0 in detail (4 GPUs), nodes 1-17 abstracted. All 0-indexed.  |

**Mesh lines render behind GPU boxes** (opaque background rect). Without this, the 28 crossing lines make the GPU labels unreadable.

## Scale-Up Topology Reference

| GPU               | Topology                   | NVSwitches | GPUs                   |
| ----------------- | -------------------------- | ---------- | ---------------------- |
| H100/H200 SXM     | Switched 4-rail Optimized  | 4          | 8                      |
| B200/B300 SXM     | Switched 2-rail Optimized  | 2          | 8                      |
| GB200/GB300 NVL72 | Switched 18-rail Optimized | 18         | 72 (18 nodes x 4 GPUs) |
| MI300X/MI325X     | Full Mesh                  | 0          | 8                      |
| MI355X            | Full Mesh                  | 0          | 8                      |

- NVL72 uses 0-indexed nodes/switches (0-17). Use "NVSwitch" not "NVSw"
- AMD mesh bandwidth: MI300X/MI325X = `7x64 GB/s`, MI355X = `7x76.8 GB/s`
- Scale Up Switch: Hopper = `7.2Tbit/s Gen 3.0`, Blackwell = `28.8Tbit/s Gen 4.0`, AMD = `null` (display "—")

## Hardware Data Gotchas

- **SXM vs NVL72 variants of the same chip have different specs**. B200 SXM = 180 GB memory, GB200 NVL72 = 192 GB. NVL72 runs at higher TDP, so TFLOPS differ too.
- **Blackwell Ultra (B300/GB300) only improves FP4** (1.5x over B200/GB200). FP8 and BF16 are unchanged for SXM. Don't assume all precisions scale equally.
- **MI355X is the first AMD GPU with FP4 support**. MI300X and MI325X don't have it.
- **Memory type (HBM3/HBM3e) is stored but intentionally not displayed**. It's not a meaningful inference performance differentiator — bandwidth matters more, and that's shown separately.
