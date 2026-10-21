# GPU Specs — Design Conventions

## Why These Specific Unit Conventions

- **Scale-up bandwidth is always unidirectional** (not bidirectional). Vendor spec sheets often quote bidirectional. We halve it for consistency because unidirectional is what matters for actual data transfer between a GPU pair.
- **TFLOPS are dense tensor core peak without sparsity**. Sparsity doubles theoretical FLOPS but real workloads rarely achieve structured sparsity. Dense values reflect realistic performance.
- **NIC naming is `{Model} {PortSpec}`** not `{PortSpec} {Model}` because the model name (ConnectX-7, Pollara) identifies the generation, which is more important for comparison. `GbE` suffix = Ethernet; plain `G` = InfiniBand (industry convention).

## Why NVL72 Systems Have No Scale-Out Topology

GB200 and GB300 NVL72 are rack-scale systems where all 72 GPUs are connected via NVLink domain. There's no "scale out" — the entire rack IS the compute unit. Scale-out would be connecting multiple NVL72 racks, which isn't a standardized topology yet. Fields are `null`, rendered as `N/A²` with footnote.

## Scale-Out Topology Invariants

- **Leaf switches live inside the rail pod**, not at spine level. This is a common mistake in network diagrams. Servers → leaf (intra-pod) → spine (inter-pod).
- **Spine count = half of leaf count** when using the same switch model. This maintains a 2:1 oversubscription ratio, which is the standard non-blocking fabric design.
- **B200 is special**: Uses Google's gIB SKU with separate leaf (TH3) and spine (TH4) switch models, 4 pods of 4 servers instead of the usual 1-pod layout.
- **Dashed lines** = abstracted connections (one element representing many). Solid lines = explicit 1:1 connections.
- **Dual-port NICs** (2x prefix) draw 2 parallel lines to the leaf switch because each port is an independent network path.

## Hardware Data Gotchas

- **SXM vs NVL72 variants of the same chip have different specs**. B200 SXM = 180 GB memory, GB200 NVL72 = 186 GB. NVL72 runs at higher TDP, so TFLOPS differ too.
- **Blackwell Ultra (B300/GB300) only improves FP4** (1.5x over B200/GB200). FP8 and BF16 are unchanged for SXM. Don't assume all precisions scale equally.
- **MI355X is the first AMD GPU with FP4 support**. MI300X and MI325X don't have it.
- **Memory type (HBM3/HBM3e) is left out of the GPU Specs table**. It's not a meaningful inference performance differentiator. Bandwidth matters more, and that's shown separately. Chip pages still show the type next to capacity.

## Chip Page Table Presentation

Chip specification table cell padding on `/chips/*` and `/zh/chips/*` is
presentation-only. It changes no data, selectors, defaults, or calculations;
API contracts, OpenAPI schemas, and inferencex-skills require no changes.
