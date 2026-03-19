/**
 * GPU hardware specifications for the GPU Specs page.
 * Contains per-GPU specs including memory, compute, and interconnect details.
 *
 * Notes:
 * - All compute TFLOPS values are dense (without sparsity) tensor core peak values
 * - Memory bandwidth is per-GPU
 * - Scale-up BW is the per-GPU unidirectional NVLink/Infinity Fabric bandwidth
 * - Scale out BW is the per-NIC bandwidth
 */

export interface GpuSpec {
  /** Display name */
  name: string;
  /** Vendor: 'nvidia' or 'amd' */
  vendor: 'nvidia' | 'amd';
  /** GPU memory capacity */
  memory: string;
  /** Memory type (e.g. HBM3, HBM3e) */
  memoryType: string;
  /** Per-GPU memory bandwidth */
  memoryBandwidth: string;
  /** FP4 dense TFLOPS, null if not supported */
  fp4: number | null;
  /** FP8 dense TFLOPS */
  fp8: number;
  /** BF16 dense TFLOPS */
  bf16: number;
  /** Scale-up interconnect technology name */
  scaleUpTech: string;
  /** Per-GPU unidirectional scale-up bandwidth */
  scaleUpBandwidth: string;
  /** Number of GPUs in the scale-up domain */
  scaleUpWorldSize: number;
  /** Per-NIC scale-out bandwidth, null if N/A */
  scaleOutBandwidth: string | null;
  /** Scale-out network technology */
  scaleOutTech: string | null;
  /** NIC model, null if N/A (e.g. NVL72) */
  nic: string | null;
  /** Scale-out switch model, null if N/A (e.g. NVL72) */
  scaleOutSwitch: string | null;
  /** Scale-out topology (e.g. "8-rail optimized"), null if N/A */
  scaleOutTopology: string | null;
  /** Scale-up topology type (e.g. "Switched 4-rail Optimized", "Full Mesh") */
  scaleUpTopology: string;
  /** Scale-up switch model, null if mesh topology (no switches) */
  scaleUpSwitch: string | null;
}

export const GPU_SPECS: GpuSpec[] = [
  {
    name: 'H100 SXM',
    vendor: 'nvidia',
    memory: '80 GB',
    memoryType: 'HBM3',
    memoryBandwidth: '3.35 TB/s',
    fp4: null,
    fp8: 1979,
    bf16: 989,
    scaleUpTech: 'NVLink 4.0',
    scaleUpBandwidth: '450 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '400 Gbit/s',
    scaleOutTech: 'RoCEv2 Ethernet',
    nic: 'ConnectX-7 2x200GbE',
    scaleOutSwitch: '25.6T Arista Tomahawk4 7060DX5-64S',
    scaleOutTopology: '8-rail optimized',
    scaleUpTopology: 'Switched 4-rail Optimized',
    scaleUpSwitch: '7.2Tbit/s NVSwitch Gen 3.0',
  },
  {
    name: 'H200 SXM',
    vendor: 'nvidia',
    memory: '141 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '4.8 TB/s',
    fp4: null,
    fp8: 1979,
    bf16: 989,
    scaleUpTech: 'NVLink 4.0',
    scaleUpBandwidth: '450 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '400 Gbit/s',
    scaleOutTech: 'InfiniBand NDR',
    nic: 'ConnectX-7 400G',
    scaleOutSwitch: '25.6T NVIDIA Quantum-2 QM9790',
    scaleOutTopology: '8-rail optimized',
    scaleUpTopology: 'Switched 4-rail Optimized',
    scaleUpSwitch: '7.2Tbit/s NVSwitch Gen 3.0',
  },
  {
    name: 'B200 SXM',
    vendor: 'nvidia',
    memory: '180 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '8 TB/s',
    fp4: 9000,
    fp8: 4500,
    bf16: 2250,
    scaleUpTech: 'NVLink 5.0',
    scaleUpBandwidth: '900 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '400 Gbit/s',
    scaleOutTech: 'gIB RoCEv2 Ethernet',
    nic: 'ConnectX-7 400GbE',
    scaleOutSwitch: '12.8T Whitebox Leaf Tomahawk3 & 25.6T Whitebox Tomahawk4',
    scaleOutTopology: '4-rail optimized',
    scaleUpTopology: 'Switched 2-rail Optimized',
    scaleUpSwitch: '28.8Tbit/s NVSwitch Gen 4.0',
  },
  {
    name: 'B300 SXM',
    vendor: 'nvidia',
    memory: '268 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '8 TB/s',
    fp4: 13500,
    fp8: 4500,
    bf16: 2250,
    scaleUpTech: 'NVLink 5.0',
    scaleUpBandwidth: '900 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '800 Gbit/s',
    scaleOutTech: 'RoCEv2 Ethernet',
    nic: 'ConnectX-8 2x400GbE',
    scaleOutSwitch: '51.2T NVIDIA Spectrum-X SN5600',
    scaleOutTopology: '8-rail optimized',
    scaleUpTopology: 'Switched 2-rail Optimized',
    scaleUpSwitch: '28.8Tbit/s NVSwitch Gen 4.0',
  },
  {
    name: 'GB200 NVL72',
    vendor: 'nvidia',
    memory: '192 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '8 TB/s',
    fp4: 10000,
    fp8: 5000,
    bf16: 2500,
    scaleUpTech: 'NVLink 5.0',
    scaleUpBandwidth: '900 GB/s',
    scaleUpWorldSize: 72,
    scaleOutBandwidth: null,
    scaleOutTech: null,
    nic: null,
    scaleOutSwitch: null,
    scaleOutTopology: null,
    scaleUpTopology: 'Switched 18-rail Optimized',
    scaleUpSwitch: '28.8Tbit/s NVSwitch Gen 4.0',
  },
  {
    name: 'GB300 NVL72',
    vendor: 'nvidia',
    memory: '288 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '8 TB/s',
    fp4: 15000,
    fp8: 5000,
    bf16: 2500,
    scaleUpTech: 'NVLink 5.0',
    scaleUpBandwidth: '900 GB/s',
    scaleUpWorldSize: 72,
    scaleOutBandwidth: null,
    scaleOutTech: null,
    nic: null,
    scaleOutSwitch: null,
    scaleOutTopology: null,
    scaleUpTopology: 'Switched 18-rail Optimized',
    scaleUpSwitch: '28.8Tbit/s NVSwitch Gen 4.0',
  },
  {
    name: 'MI300X',
    vendor: 'amd',
    memory: '192 GB',
    memoryType: 'HBM3',
    memoryBandwidth: '5.3 TB/s',
    fp4: null,
    fp8: 2615,
    bf16: 1307,
    scaleUpTech: 'Infinity Fabric',
    scaleUpBandwidth: '448 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '400 Gbit/s',
    scaleOutTech: 'RoCEv2 Ethernet',
    nic: 'Pollara 400GbE',
    scaleOutSwitch: '51.2T Tomahawk5',
    scaleOutTopology: '8-rail optimized',
    scaleUpTopology: 'Full Mesh',
    scaleUpSwitch: null,
  },
  {
    name: 'MI325X',
    vendor: 'amd',
    memory: '256 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '6 TB/s',
    fp4: null,
    fp8: 2615,
    bf16: 1307,
    scaleUpTech: 'Infinity Fabric',
    scaleUpBandwidth: '448 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '400 Gbit/s',
    scaleOutTech: 'RoCEv2 Ethernet',
    nic: 'Pollara 400GbE',
    scaleOutSwitch: '51.2T Tomahawk5',
    scaleOutTopology: '8-rail optimized',
    scaleUpTopology: 'Full Mesh',
    scaleUpSwitch: null,
  },
  {
    name: 'MI355X',
    vendor: 'amd',
    memory: '288 GB',
    memoryType: 'HBM3e',
    memoryBandwidth: '8 TB/s',
    fp4: 10066,
    fp8: 5033,
    bf16: 2516,
    scaleUpTech: '5th Gen Infinity Fabric',
    scaleUpBandwidth: '576 GB/s',
    scaleUpWorldSize: 8,
    scaleOutBandwidth: '400 Gbit/s',
    scaleOutTech: 'RoCEv2 Ethernet',
    nic: 'Pollara 400GbE',
    scaleOutSwitch: '51.2T Arista Tomahawk5 DCS-7060X6-64PE',
    scaleOutTopology: '8-rail optimized',
    scaleUpTopology: 'Full Mesh',
    scaleUpSwitch: null,
  },
];

/** Column definitions for the GPU specs table */
export const GPU_SPEC_COLUMNS = [
  { key: 'name', label: 'GPU', align: 'left' as const },
  { key: 'memory', label: 'Memory', align: 'right' as const },
  { key: 'memoryBandwidth', label: 'Mem BW', align: 'right' as const },
  { key: 'fp4', label: 'FP4 TFLOP/s', align: 'right' as const },
  { key: 'fp8', label: 'FP8 TFLOP/s', align: 'right' as const },
  { key: 'bf16', label: 'BF16 TFLOP/s', align: 'right' as const },
  { key: 'scaleUpTech', label: 'Scale Up', align: 'left' as const },
  { key: 'scaleUpBandwidth', label: 'Scale Up BW', align: 'right' as const },
  { key: 'scaleUpWorldSize', label: 'World Size', align: 'right' as const },
  { key: 'domainMemory', label: 'Scale Up Domain Memory', align: 'right' as const },
  { key: 'domainMemoryBandwidth', label: 'Scale Up Domain Mem BW', align: 'right' as const },
  { key: 'scaleUpTopology', label: 'Scale Up Topology', align: 'left' as const },
  { key: 'scaleUpSwitch', label: 'Scale Up Switch', align: 'left' as const },
  { key: 'scaleOutBandwidth', label: 'Scale Out BW per GPU', align: 'right' as const },
  { key: 'scaleOutTech', label: 'Scale Out Tech', align: 'left' as const },
  { key: 'scaleOutSwitch', label: 'Scale Out Switch', align: 'left' as const },
  { key: 'scaleOutTopology', label: 'Scale Out Topology', align: 'left' as const },
  { key: 'nic', label: 'NIC', align: 'left' as const },
] as const;

/**
 * Compute the total memory capacity across the scale-up domain.
 * Parses the per-GPU memory string (e.g. "180 GB") and multiplies by world size.
 * Always returns the result in TB.
 */
export function getScaleUpDomainMemory(spec: GpuSpec): string {
  const gb = parseFloat(spec.memory);
  const total = gb * spec.scaleUpWorldSize;
  const tb = total / 1000;
  if (tb % 1 === 0) return `${tb} TB`;
  // Use up to 2 decimal places, trimming trailing zeros
  const formatted = tb.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted} TB`;
}

/**
 * Compute the total memory bandwidth across the scale-up domain.
 * Parses the per-GPU bandwidth string (e.g. "8 TB/s") and multiplies by world size.
 */
export function getScaleUpDomainMemoryBw(spec: GpuSpec): string {
  const tbps = parseFloat(spec.memoryBandwidth);
  const total = tbps * spec.scaleUpWorldSize;
  return `${total % 1 === 0 ? total : total.toFixed(1)} TB/s`;
}

/**
 * Format a TFLOPS number with commas for display.
 * Returns '—' for null values (unsupported features).
 */
export function formatTflops(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US');
}

/**
 * Format a nullable string value for display.
 * Returns 'N/A' for null values.
 */
export function formatNullable(value: string | null): string {
  return value ?? 'N/A';
}

/**
 * Topology configuration for rendering scale-out topology diagrams.
 */
export interface TopologyConfig {
  /** Number of leaf switches (rails) in the topology */
  railCount: number;
  /** Number of GPUs in the server node */
  gpuCount: number;
  /** Number of NICs (always equal to gpuCount — one NIC per GPU) */
  nicCount: number;
  /** NIC-to-leaf mapping: nicToLeaf[nicIdx] = leaf switch index */
  nicToLeaf: number[];
  /** NIC model label */
  nicLabel: string;
  /** Leaf switch model label */
  switchLabel: string;
  /** Spine switch model label (same ASIC family as leaf in 2-tier fat-tree) */
  spineLabel: string;
  /** Number of spine switches shown in diagram */
  spineCount: number;
  /** Network technology (e.g. "InfiniBand NDR", "RoCEv2 Ethernet") */
  networkTech: string;
  /** Number of servers per rail-pod */
  serversPerPod: number;
  /** Number of rail-pods in the cluster */
  podCount: number;
}

/**
 * Derive the scale-out topology configuration from a GPU spec.
 * Returns null for GPUs without scale-out (e.g. NVL72 systems).
 */
export function getTopologyConfig(spec: GpuSpec): TopologyConfig | null {
  if (spec.scaleOutTopology === null) return null;

  const railCount = parseInt(spec.scaleOutTopology, 10); // "8-rail optimized" → 8
  const gpuCount = spec.scaleUpWorldSize; // 8 for non-NVL72
  const nicCount = gpuCount; // Always one NIC per GPU

  // Build NIC-to-leaf mapping: each NIC connects to one leaf switch
  // For 8-rail: NIC i → leaf i (1:1)
  // For 4-rail: NICs 0,1 → leaf 0; NICs 2,3 → leaf 1; etc. (2 NICs per leaf)
  const nicsPerLeaf = nicCount / railCount;
  const nicToLeaf: number[] = [];
  for (let i = 0; i < nicCount; i++) {
    nicToLeaf.push(Math.floor(i / nicsPerLeaf));
  }

  // Determine leaf and spine switch labels
  // B200 has separate leaf (Tomahawk3) and spine (Tomahawk4) switches, stored as "leaf & spine"
  let leafLabel: string;
  let spineLabel: string;
  if (spec.scaleOutSwitch && spec.scaleOutSwitch.includes(' & ')) {
    const parts = spec.scaleOutSwitch.split(' & ');
    leafLabel = parts[0];
    spineLabel = parts[1];
  } else {
    leafLabel = spec.scaleOutSwitch ?? 'Switch';
    spineLabel = spec.scaleOutSwitch ?? 'Switch';
  }

  // Cluster topology: servers per rail-pod, pod count, spine switches
  // General rule: spine count = half of leaf count when leaf & spine are the same switch model
  // H100/H200: 32 servers per rail-pod, 1 rail-pod, 4 spine switches
  // B200 (Google gIB SKU): 4 servers per rail-pod, 4 rail-pods, 2 spine switches (different leaf/spine models)
  // B300: 32 servers per rail-pod, 1 rail-pod, 4 spine switches
  // MI300/MI325/MI355: 64 servers per rail-pod, 1 rail-pod, 4 spine switches
  let spineCount: number;
  let serversPerPod: number;
  let podCount: number;

  if (spec.name === 'H100 SXM' || spec.name === 'H200 SXM') {
    serversPerPod = 32;
    podCount = 1;
    spineCount = 4;
  } else if (spec.name === 'B200 SXM') {
    serversPerPod = 4;
    podCount = 4;
    spineCount = 2;
  } else if (spec.name === 'B300 SXM') {
    serversPerPod = 32;
    podCount = 1;
    spineCount = Math.floor(railCount / 2);
  } else if (spec.name.startsWith('MI')) {
    serversPerPod = 64;
    podCount = 1;
    spineCount = Math.floor(railCount / 2);
  } else {
    // Default: spine = half of leaf count
    serversPerPod = 8;
    podCount = 1;
    spineCount = Math.floor(railCount / 2);
  }

  return {
    railCount,
    gpuCount,
    nicCount,
    nicToLeaf,
    nicLabel: spec.nic ?? 'NIC',
    switchLabel: leafLabel,
    spineLabel,
    spineCount,
    networkTech: spec.scaleOutTech ?? '',
    serversPerPod,
    podCount,
  };
}

/**
 * Definition of a chartable GPU metric for bar chart comparison.
 */
export interface GpuChartMetric {
  /** Unique key for the metric */
  key: string;
  /** Display label */
  label: string;
  /** Unit for the axis label */
  unit: string;
  /** Extract the numeric value from a GPU spec. Returns null if not available. */
  getValue: (spec: GpuSpec) => number | null;
}

/**
 * Parse a numeric value from a string with units (e.g. "80 GB" → 80, "3.35 TB/s" → 3.35).
 * Returns null if the string is null or cannot be parsed.
 */
export function parseNumericFromString(value: string | null): number | null {
  if (value === null) return null;
  const num = parseFloat(value);
  return Number.isNaN(num) ? null : num;
}

/**
 * Compute the numeric scale-up domain memory in TB.
 */
export function getScaleUpDomainMemoryNumeric(spec: GpuSpec): number {
  const gb = parseFloat(spec.memory);
  return (gb * spec.scaleUpWorldSize) / 1000;
}

/**
 * Compute the numeric scale-up domain memory bandwidth in TB/s.
 */
export function getScaleUpDomainMemoryBwNumeric(spec: GpuSpec): number {
  const tbps = parseFloat(spec.memoryBandwidth);
  return tbps * spec.scaleUpWorldSize;
}

/** All chartable GPU metrics available for bar chart comparison. */
export const GPU_CHART_METRICS: GpuChartMetric[] = [
  {
    key: 'memory',
    label: 'Memory',
    unit: 'GB',
    getValue: (spec) => parseNumericFromString(spec.memory),
  },
  {
    key: 'memoryBandwidth',
    label: 'Mem BW',
    unit: 'TB/s',
    getValue: (spec) => parseNumericFromString(spec.memoryBandwidth),
  },
  {
    key: 'fp4',
    label: 'FP4 TFLOP/s',
    unit: 'TFLOP/s',
    getValue: (spec) => spec.fp4,
  },
  {
    key: 'fp8',
    label: 'FP8 TFLOP/s',
    unit: 'TFLOP/s',
    getValue: (spec) => spec.fp8,
  },
  {
    key: 'bf16',
    label: 'BF16 TFLOP/s',
    unit: 'TFLOP/s',
    getValue: (spec) => spec.bf16,
  },
  {
    key: 'scaleUpBandwidth',
    label: 'Scale Up BW',
    unit: 'GB/s',
    getValue: (spec) => parseNumericFromString(spec.scaleUpBandwidth),
  },
  {
    key: 'scaleUpWorldSize',
    label: 'World Size',
    unit: 'GPUs',
    getValue: (spec) => spec.scaleUpWorldSize,
  },
  {
    key: 'domainMemory',
    label: 'Scale Up Domain Memory',
    unit: 'TB',
    getValue: (spec) => getScaleUpDomainMemoryNumeric(spec),
  },
  {
    key: 'domainMemoryBandwidth',
    label: 'Scale Up Domain Mem BW',
    unit: 'TB/s',
    getValue: (spec) => getScaleUpDomainMemoryBwNumeric(spec),
  },
  {
    key: 'scaleOutBandwidth',
    label: 'Scale Out BW per GPU',
    unit: 'Gbit/s',
    getValue: (spec) => parseNumericFromString(spec.scaleOutBandwidth),
  },
];

/**
 * Configuration for rendering scale-up topology diagrams.
 */
export interface ScaleUpTopologyConfig {
  /** Topology type: 'switched' uses NVSwitches, 'mesh' is point-to-point */
  type: 'switched' | 'mesh';
  /** Number of GPUs shown in detail view */
  gpuCount: number;
  /** Number of NVSwitches (0 for mesh) */
  switchCount: number;
  /** Scale-up interconnect technology name */
  techName: string;
  /** Total per-GPU unidirectional bandwidth */
  totalBandwidth: string;
  /** Number of compute nodes (1 for SXM, 18 for NVL72) */
  nodeCount: number;
  /** GPUs per compute node */
  gpusPerNode: number;
}

/**
 * Derive the scale-up topology configuration from a GPU spec.
 * All GPUs have a scale-up topology (unlike scale-out which NVL72 lacks).
 */
export function getScaleUpTopologyConfig(spec: GpuSpec): ScaleUpTopologyConfig {
  // AMD: Full mesh via xGMI/Infinity Fabric
  if (spec.vendor === 'amd') {
    return {
      type: 'mesh',
      gpuCount: spec.scaleUpWorldSize,
      switchCount: 0,
      techName: spec.scaleUpTech,
      totalBandwidth: spec.scaleUpBandwidth,
      nodeCount: 1,
      gpusPerNode: spec.scaleUpWorldSize,
    };
  }

  // NVIDIA NVL72: 18 NVSwitches, 18 nodes × 4 GPUs
  if (spec.name.includes('NVL72')) {
    return {
      type: 'switched',
      gpuCount: 72,
      switchCount: 18,
      techName: spec.scaleUpTech,
      totalBandwidth: spec.scaleUpBandwidth,
      nodeCount: 18,
      gpusPerNode: 4,
    };
  }

  // NVIDIA NVLink 4.0 (Hopper): 4 NVSwitches
  if (spec.scaleUpTech === 'NVLink 4.0') {
    return {
      type: 'switched',
      gpuCount: spec.scaleUpWorldSize,
      switchCount: 4,
      techName: spec.scaleUpTech,
      totalBandwidth: spec.scaleUpBandwidth,
      nodeCount: 1,
      gpusPerNode: spec.scaleUpWorldSize,
    };
  }

  // NVIDIA NVLink 5.0 SXM (Blackwell): 2 NVSwitches
  return {
    type: 'switched',
    gpuCount: spec.scaleUpWorldSize,
    switchCount: 2,
    techName: spec.scaleUpTech,
    totalBandwidth: spec.scaleUpBandwidth,
    nodeCount: 1,
    gpusPerNode: spec.scaleUpWorldSize,
  };
}
