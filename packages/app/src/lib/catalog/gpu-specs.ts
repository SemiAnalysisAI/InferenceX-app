export interface GpuSpec {
  name: string;
  vendor: 'nvidia' | 'amd';
  memory: string;
  memoryType: string;
  memoryBandwidth: string;
  fp4: number | null;
  fp8: number;
  bf16: number;
  scaleUpTech: string;
  scaleUpBandwidth: string;
  scaleUpWorldSize: number;
  scaleOutBandwidth: string | null;
  scaleOutTech: string | null;
  nic: string | null;
  scaleOutSwitch: string | null;
  scaleOutTopology: string | null;
  scaleUpTopology: string;
  scaleUpSwitch: string | null;
}

export function formatScaleOutTopology(value: string, locale: 'en' | 'zh'): string {
  if (locale === 'en') return value;
  const match = /^(?<rails>\d+)-rail optimized$/u.exec(value);
  return match?.groups ? `${match.groups.rails}-rail 优化拓扑` : value;
}

export function getScaleOutExpandAriaLabel(gpuName: string, locale: 'en' | 'zh'): string {
  return locale === 'zh' ? `展开 ${gpuName} 横向扩展拓扑图` : `Expand ${gpuName} topology diagram`;
}

export function formatScaleUpTopology(value: string, locale: 'en' | 'zh'): string {
  if (locale === 'en') return value;
  if (value === 'Full Mesh') return '全互连';
  const match = /^Switched (?<rails>\d+)-rail Optimized$/u.exec(value);
  return match?.groups ? `${match.groups.rails}-rail 优化交换拓扑` : value;
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
    memory: '186 GB',
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
    memory: '278 GB',
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
    scaleUpBandwidth: '538 GB/s',
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

export const GPU_SPEC_COLUMNS = [
  { key: 'name', label: 'Chip', align: 'left' as const },
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
  { key: 'scaleOutBandwidth', label: 'Scale Out BW per Chip', align: 'right' as const },
  { key: 'scaleOutTech', label: 'Scale Out Tech', align: 'left' as const },
  { key: 'scaleOutSwitch', label: 'Scale Out Switch', align: 'left' as const },
  { key: 'scaleOutTopology', label: 'Scale Out Topology', align: 'left' as const },
  { key: 'nic', label: 'NIC', align: 'left' as const },
] as const;

export function getScaleUpDomainMemory(spec: GpuSpec): string {
  const gb = parseFloat(spec.memory);
  const total = gb * spec.scaleUpWorldSize;
  const tb = total / 1000;
  if (tb % 1 === 0) return `${tb} TB`;
  const formatted = tb.toFixed(2).replace(/\.?0+$/u, '');
  return `${formatted} TB`;
}

export function getScaleUpDomainMemoryBw(spec: GpuSpec): string {
  const tbps = parseFloat(spec.memoryBandwidth);
  const total = tbps * spec.scaleUpWorldSize;
  return `${total % 1 === 0 ? total : total.toFixed(1)} TB/s`;
}

export function formatTflops(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US');
}

export function formatNullable(value: string | null): string {
  return value ?? 'N/A';
}

export interface TopologyConfig {
  railCount: number;
  gpuCount: number;
  nicCount: number;
  nicToLeaf: number[];
  nicLabel: string;
  switchLabel: string;
  spineLabel: string;
  spineCount: number;
  networkTech: string;
  serversPerPod: number;
  podCount: number;
}

export function getTopologyConfig(spec: GpuSpec): TopologyConfig | null {
  if (spec.scaleOutTopology === null) return null;

  const railCount = parseInt(spec.scaleOutTopology, 10);
  const gpuCount = spec.scaleUpWorldSize;
  const nicCount = gpuCount;

  const nicsPerLeaf = nicCount / railCount;
  const nicToLeaf: number[] = [];
  for (let i = 0; i < nicCount; i++) {
    nicToLeaf.push(Math.floor(i / nicsPerLeaf));
  }

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

  let podCount = 1;
  let spineCount = Math.floor(railCount / 2);
  let serversPerPod = 8;

  if (spec.name === 'H100 SXM' || spec.name === 'H200 SXM') {
    serversPerPod = 32;
    spineCount = 4;
  } else if (spec.name === 'B200 SXM') {
    serversPerPod = 4;
    podCount = 4;
    spineCount = 2;
  } else if (spec.name === 'B300 SXM') {
    serversPerPod = 32;
  } else if (spec.name.startsWith('MI')) {
    serversPerPod = 64;
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

export interface GpuChartMetric {
  key: string;
  label: string;
  labelZh: string;
  unit: string;
  unitZh: string;
  getValue: (spec: GpuSpec) => number | null;
}

export function parseNumericFromString(value: string | null): number | null {
  if (value === null) return null;
  const num = parseFloat(value);
  return Number.isNaN(num) ? null : num;
}

export function getScaleUpDomainMemoryNumeric(spec: GpuSpec): number {
  const gb = parseFloat(spec.memory);
  return (gb * spec.scaleUpWorldSize) / 1000;
}

export function getScaleUpDomainMemoryBwNumeric(spec: GpuSpec): number {
  const tbps = parseFloat(spec.memoryBandwidth);
  return tbps * spec.scaleUpWorldSize;
}

export const GPU_CHART_METRICS: GpuChartMetric[] = [
  {
    key: 'memory',
    label: 'Memory',
    labelZh: '显存容量',
    unit: 'GB',
    unitZh: 'GB',
    getValue: (spec) => parseNumericFromString(spec.memory),
  },
  {
    key: 'memoryBandwidth',
    label: 'Mem BW',
    labelZh: '显存带宽',
    unit: 'TB/s',
    unitZh: 'TB/s',
    getValue: (spec) => parseNumericFromString(spec.memoryBandwidth),
  },
  {
    key: 'fp4',
    label: 'FP4 TFLOP/s',
    labelZh: 'FP4 TFLOP/s',
    unit: 'TFLOP/s',
    unitZh: 'TFLOP/s',
    getValue: (spec) => spec.fp4,
  },
  {
    key: 'fp8',
    label: 'FP8 TFLOP/s',
    labelZh: 'FP8 TFLOP/s',
    unit: 'TFLOP/s',
    unitZh: 'TFLOP/s',
    getValue: (spec) => spec.fp8,
  },
  {
    key: 'bf16',
    label: 'BF16 TFLOP/s',
    labelZh: 'BF16 TFLOP/s',
    unit: 'TFLOP/s',
    unitZh: 'TFLOP/s',
    getValue: (spec) => spec.bf16,
  },
  {
    key: 'scaleUpBandwidth',
    label: 'Scale Up BW',
    labelZh: '纵向扩展带宽',
    unit: 'GB/s',
    unitZh: 'GB/s',
    getValue: (spec) => parseNumericFromString(spec.scaleUpBandwidth),
  },
  {
    key: 'scaleUpWorldSize',
    label: 'World Size',
    labelZh: '域内芯片数',
    unit: 'Chips',
    unitZh: '芯片',
    getValue: (spec) => spec.scaleUpWorldSize,
  },
  {
    key: 'domainMemory',
    label: 'Scale Up Domain Memory',
    labelZh: '纵向扩展域显存',
    unit: 'TB',
    unitZh: 'TB',
    getValue: (spec) => getScaleUpDomainMemoryNumeric(spec),
  },
  {
    key: 'domainMemoryBandwidth',
    label: 'Scale Up Domain Mem BW',
    labelZh: '纵向扩展域显存带宽',
    unit: 'TB/s',
    unitZh: 'TB/s',
    getValue: (spec) => getScaleUpDomainMemoryBwNumeric(spec),
  },
  {
    key: 'scaleOutBandwidth',
    label: 'Scale Out BW per Chip',
    labelZh: '每芯片横向扩展带宽',
    unit: 'Gbit/s',
    unitZh: 'Gbit/s',
    getValue: (spec) => parseNumericFromString(spec.scaleOutBandwidth),
  },
];

export interface ScaleUpTopologyConfig {
  type: 'switched' | 'mesh';
  gpuCount: number;
  switchCount: number;
  techName: string;
  totalBandwidth: string;
  nodeCount: number;
  gpusPerNode: number;
}

export function getScaleUpTopologyConfig(spec: GpuSpec): ScaleUpTopologyConfig {
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
