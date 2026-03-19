import { describe, expect, it } from 'vitest';

import {
  formatNullable,
  formatTflops,
  getScaleUpDomainMemory,
  getScaleUpDomainMemoryBw,
  getScaleUpDomainMemoryBwNumeric,
  getScaleUpDomainMemoryNumeric,
  getScaleUpTopologyConfig,
  getTopologyConfig,
  GPU_CHART_METRICS,
  GPU_SPEC_COLUMNS,
  GPU_SPECS,
  parseNumericFromString,
  type GpuSpec,
} from '@/lib/gpu-specs';

describe('GPU_SPECS', () => {
  it('contains all expected GPUs', () => {
    const names = GPU_SPECS.map((s) => s.name);
    expect(names).toContain('H100 SXM');
    expect(names).toContain('H200 SXM');
    expect(names).toContain('B200 SXM');
    expect(names).toContain('B300 SXM');
    expect(names).toContain('GB200 NVL72');
    expect(names).toContain('GB300 NVL72');
    expect(names).toContain('MI300X');
    expect(names).toContain('MI325X');
    expect(names).toContain('MI355X');
  });

  it('has 9 GPU entries', () => {
    expect(GPU_SPECS).toHaveLength(9);
  });

  it('every entry has required fields', () => {
    for (const spec of GPU_SPECS) {
      expect(spec.name).toBeTruthy();
      expect(['nvidia', 'amd']).toContain(spec.vendor);
      expect(spec.memory).toBeTruthy();
      expect(spec.memoryType).toBeTruthy();
      expect(spec.memoryBandwidth).toBeTruthy();
      expect(spec.fp8).toBeGreaterThan(0);
      expect(spec.bf16).toBeGreaterThan(0);
      expect(spec.scaleUpTech).toBeTruthy();
      expect(spec.scaleUpBandwidth).toBeTruthy();
      expect(spec.scaleUpWorldSize).toBeGreaterThan(0);
      expect(spec.scaleUpTopology).toBeTruthy();
      // nic can be null for NVL72 systems
      if (!spec.name.includes('NVL72')) {
        expect(spec.nic).toBeTruthy();
      }
    }
  });

  it('uses GB unit for memory', () => {
    for (const spec of GPU_SPECS) {
      expect(spec.memory).toMatch(/GB$/);
    }
  });

  it('uses GB/s unit for scale-up bandwidth', () => {
    for (const spec of GPU_SPECS) {
      expect(spec.scaleUpBandwidth).toMatch(/GB\/s$/);
    }
  });

  it('uses Gbit/s unit for scale-out bandwidth', () => {
    for (const spec of GPU_SPECS) {
      if (spec.scaleOutBandwidth !== null) {
        expect(spec.scaleOutBandwidth).toMatch(/Gbit\/s$/);
      }
    }
  });

  it('B200 SXM and GB200 NVL72 have different memory capacities', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('B200 SXM').memory).toBe('180 GB');
    expect(find('GB200 NVL72').memory).toBe('192 GB');
  });

  it('B300 SXM and GB300 NVL72 have different memory capacities', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('B300 SXM').memory).toBe('268 GB');
    expect(find('GB300 NVL72').memory).toBe('288 GB');
  });

  it('NIC values have name first then port spec', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;

    expect(find('H100 SXM').nic).toBe('ConnectX-7 2x200GbE');
    expect(find('H200 SXM').nic).toBe('ConnectX-7 400G');
    expect(find('B200 SXM').nic).toBe('ConnectX-7 400GbE');
    expect(find('B300 SXM').nic).toBe('ConnectX-8 2x400GbE');

    // NVL72 systems don't have scale-out NICs
    expect(find('GB200 NVL72').nic).toBeNull();
    expect(find('GB300 NVL72').nic).toBeNull();

    // AMD GPUs use Pollara
    expect(find('MI300X').nic).toBe('Pollara 400GbE');
    expect(find('MI325X').nic).toBe('Pollara 400GbE');
    expect(find('MI355X').nic).toBe('Pollara 400GbE');
  });

  it('scale out technology matches issue requirements', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;

    // H100 is RoCEv2 Ethernet (no vendor prefix)
    expect(find('H100 SXM').scaleOutTech).toBe('RoCEv2 Ethernet');

    // MI300X/MI325X/MI355X is RoCEv2 Ethernet
    expect(find('MI300X').scaleOutTech).toBe('RoCEv2 Ethernet');
    expect(find('MI325X').scaleOutTech).toBe('RoCEv2 Ethernet');
    expect(find('MI355X').scaleOutTech).toBe('RoCEv2 Ethernet');

    // GB200/GB300 is N/A
    expect(find('GB200 NVL72').scaleOutTech).toBeNull();
    expect(find('GB300 NVL72').scaleOutTech).toBeNull();

    // B300 is RoCEv2 Ethernet
    expect(find('B300 SXM').scaleOutTech).toBe('RoCEv2 Ethernet');

    // H200 is InfiniBand NDR
    expect(find('H200 SXM').scaleOutTech).toBe('InfiniBand NDR');

    // B200 uses gIB RoCEv2 Ethernet
    expect(find('B200 SXM').scaleOutTech).toBe('gIB RoCEv2 Ethernet');
  });

  it('NVIDIA GPUs have nvidia vendor', () => {
    const nvidiaGpus = GPU_SPECS.filter((s) => s.vendor === 'nvidia');
    expect(nvidiaGpus.length).toBe(6);
    for (const gpu of nvidiaGpus) {
      expect(gpu.name).toMatch(/^(H|B|GB)/);
    }
  });

  it('AMD GPUs have amd vendor', () => {
    const amdGpus = GPU_SPECS.filter((s) => s.vendor === 'amd');
    expect(amdGpus.length).toBe(3);
    for (const gpu of amdGpus) {
      expect(gpu.name).toMatch(/^MI/);
    }
  });

  it('Hopper GPUs (H100, H200) do not support FP4', () => {
    const hopperGpus = GPU_SPECS.filter((s) => s.name.startsWith('H'));
    for (const gpu of hopperGpus) {
      expect(gpu.fp4).toBeNull();
    }
  });

  it('Blackwell and CDNA4 GPUs support FP4', () => {
    const blackwellGpus = GPU_SPECS.filter(
      (s) => s.name.startsWith('B') || s.name.startsWith('GB'),
    );
    for (const gpu of blackwellGpus) {
      expect(gpu.fp4).toBeGreaterThan(0);
    }
    // MI355X (CDNA 4) supports FP4
    const mi355x = GPU_SPECS.find((s) => s.name === 'MI355X')!;
    expect(mi355x.fp4).toBeGreaterThan(0);
  });

  it('CDNA3 GPUs (MI300X, MI325X) do not support FP4', () => {
    const cdna3Gpus = GPU_SPECS.filter((s) => s.name === 'MI300X' || s.name === 'MI325X');
    for (const gpu of cdna3Gpus) {
      expect(gpu.fp4).toBeNull();
    }
  });

  it('B300/GB300 have higher FP4 than B200/GB200', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('B300 SXM').fp4).toBeGreaterThan(find('B200 SXM').fp4!);
    expect(find('GB300 NVL72').fp4).toBeGreaterThan(find('GB200 NVL72').fp4!);
  });

  it('NVL72 GPUs have world size of 72', () => {
    const nvl72Gpus = GPU_SPECS.filter((s) => s.name.includes('NVL72'));
    expect(nvl72Gpus.length).toBe(2);
    for (const gpu of nvl72Gpus) {
      expect(gpu.scaleUpWorldSize).toBe(72);
    }
  });

  it('scale-up bandwidth values are unidirectional', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;

    // NVLink 4.0 (Hopper): 450 GB/s unidirectional
    expect(find('H100 SXM').scaleUpBandwidth).toBe('450 GB/s');
    expect(find('H200 SXM').scaleUpBandwidth).toBe('450 GB/s');

    // NVLink 5.0 (Blackwell): 900 GB/s unidirectional
    expect(find('B200 SXM').scaleUpBandwidth).toBe('900 GB/s');
    expect(find('B300 SXM').scaleUpBandwidth).toBe('900 GB/s');
    expect(find('GB200 NVL72').scaleUpBandwidth).toBe('900 GB/s');
    expect(find('GB300 NVL72').scaleUpBandwidth).toBe('900 GB/s');

    // AMD Infinity Fabric: MI300X/MI325X = 448 GB/s, MI355X = 576 GB/s (5th Gen IF)
    expect(find('MI300X').scaleUpBandwidth).toBe('448 GB/s');
    expect(find('MI325X').scaleUpBandwidth).toBe('448 GB/s');
    expect(find('MI355X').scaleUpBandwidth).toBe('576 GB/s');
  });

  it('MI355X has higher scale-up bandwidth than MI300X/MI325X (5th Gen IF)', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    const mi300xBw = parseFloat(find('MI300X').scaleUpBandwidth);
    const mi325xBw = parseFloat(find('MI325X').scaleUpBandwidth);
    const mi355xBw = parseFloat(find('MI355X').scaleUpBandwidth);

    // MI300X and MI325X share same CDNA 3 interconnect
    expect(mi300xBw).toBe(mi325xBw);
    // MI355X (CDNA 4, 5th Gen IF) has higher bandwidth
    expect(mi355xBw).toBeGreaterThan(mi300xBw);
  });

  it('MI355X uses 5th Gen Infinity Fabric', () => {
    const mi355x = GPU_SPECS.find((s) => s.name === 'MI355X')!;
    expect(mi355x.scaleUpTech).toBe('5th Gen Infinity Fabric');
  });

  it('Blackwell Ultra (B300) has higher FP4 than Blackwell (B200)', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    const b200 = find('B200 SXM');
    const b300 = find('B300 SXM');
    expect(b300.fp4).toBeGreaterThan(b200.fp4!);
  });

  it('NVL72 variants have higher FLOPs than SXM variants', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    const b200 = find('B200 SXM');
    const gb200 = find('GB200 NVL72');
    // NVL72 liquid-cooled variants run at higher TDP
    expect(gb200.fp4).toBeGreaterThan(b200.fp4!);
    expect(gb200.fp8).toBeGreaterThan(b200.fp8);
    expect(gb200.bf16).toBeGreaterThan(b200.bf16);
  });

  it('GB300 NVL72 has correct dense TFLOPS values', () => {
    const gb300 = GPU_SPECS.find((s) => s.name === 'GB300 NVL72')!;
    expect(gb300.fp4).toBe(15000);
    expect(gb300.fp8).toBe(5000);
    expect(gb300.bf16).toBe(2500);
  });

  it('GB200 NVL72 has correct dense TFLOPS values', () => {
    const gb200 = GPU_SPECS.find((s) => s.name === 'GB200 NVL72')!;
    expect(gb200.fp4).toBe(10000);
    expect(gb200.fp8).toBe(5000);
    expect(gb200.bf16).toBe(2500);
  });

  it('scale out switch values match requirements', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;

    expect(find('H100 SXM').scaleOutSwitch).toBe('25.6T Arista Tomahawk4 7060DX5-64S');
    expect(find('H200 SXM').scaleOutSwitch).toBe('25.6T NVIDIA Quantum-2 QM9790');
    expect(find('B200 SXM').scaleOutSwitch).toBe(
      '12.8T Whitebox Leaf Tomahawk3 & 25.6T Whitebox Tomahawk4',
    );
    expect(find('B300 SXM').scaleOutSwitch).toBe('51.2T NVIDIA Spectrum-X SN5600');
    expect(find('MI300X').scaleOutSwitch).toBe('51.2T Tomahawk5');
    expect(find('MI325X').scaleOutSwitch).toBe('51.2T Tomahawk5');
    expect(find('MI355X').scaleOutSwitch).toBe('51.2T Arista Tomahawk5 DCS-7060X6-64PE');

    // NVL72 systems don't use scale out
    expect(find('GB200 NVL72').scaleOutSwitch).toBeNull();
    expect(find('GB300 NVL72').scaleOutSwitch).toBeNull();
  });

  it('scale out topology values match requirements', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;

    expect(find('H100 SXM').scaleOutTopology).toBe('8-rail optimized');
    expect(find('H200 SXM').scaleOutTopology).toBe('8-rail optimized');
    expect(find('B200 SXM').scaleOutTopology).toBe('4-rail optimized');
    expect(find('B300 SXM').scaleOutTopology).toBe('8-rail optimized');
    expect(find('MI300X').scaleOutTopology).toBe('8-rail optimized');
    expect(find('MI325X').scaleOutTopology).toBe('8-rail optimized');
    expect(find('MI355X').scaleOutTopology).toBe('8-rail optimized');

    // NVL72 systems don't use scale out
    expect(find('GB200 NVL72').scaleOutTopology).toBeNull();
    expect(find('GB300 NVL72').scaleOutTopology).toBeNull();
  });

  it('scale up switch values match requirements', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;

    // Hopper: NVSwitch Gen 3.0
    expect(find('H100 SXM').scaleUpSwitch).toBe('7.2Tbit/s NVSwitch Gen 3.0');
    expect(find('H200 SXM').scaleUpSwitch).toBe('7.2Tbit/s NVSwitch Gen 3.0');

    // Blackwell / NVL72: NVSwitch Gen 4.0
    expect(find('B200 SXM').scaleUpSwitch).toBe('28.8Tbit/s NVSwitch Gen 4.0');
    expect(find('B300 SXM').scaleUpSwitch).toBe('28.8Tbit/s NVSwitch Gen 4.0');
    expect(find('GB200 NVL72').scaleUpSwitch).toBe('28.8Tbit/s NVSwitch Gen 4.0');
    expect(find('GB300 NVL72').scaleUpSwitch).toBe('28.8Tbit/s NVSwitch Gen 4.0');

    // AMD: no scale-up switches (mesh topology)
    expect(find('MI300X').scaleUpSwitch).toBeNull();
    expect(find('MI325X').scaleUpSwitch).toBeNull();
    expect(find('MI355X').scaleUpSwitch).toBeNull();
  });

  it('B300 has correct dense TFLOPS values', () => {
    const b300 = GPU_SPECS.find((s) => s.name === 'B300 SXM')!;
    expect(b300.fp4).toBe(13500);
    expect(b300.fp8).toBe(4500);
    expect(b300.bf16).toBe(2250);
  });
});

describe('GPU_SPEC_COLUMNS', () => {
  it('has 18 columns', () => {
    expect(GPU_SPEC_COLUMNS).toHaveLength(18);
  });

  it('first column is GPU name', () => {
    expect(GPU_SPEC_COLUMNS[0].key).toBe('name');
    expect(GPU_SPEC_COLUMNS[0].label).toBe('GPU');
  });

  it('includes domain memory columns', () => {
    const keys = GPU_SPEC_COLUMNS.map((c) => c.key);
    expect(keys).toContain('domainMemory');
    expect(keys).toContain('domainMemoryBandwidth');
  });

  it('includes scale out switch and topology columns', () => {
    const keys = GPU_SPEC_COLUMNS.map((c) => c.key);
    expect(keys).toContain('scaleOutSwitch');
    expect(keys).toContain('scaleOutTopology');
  });

  it('includes scale up topology and scale up switch columns', () => {
    const keys = GPU_SPEC_COLUMNS.map((c) => c.key);
    expect(keys).toContain('scaleUpTopology');
    expect(keys).toContain('scaleUpSwitch');
  });
});

describe('formatTflops', () => {
  it('formats numbers with commas', () => {
    expect(formatTflops(1979)).toBe('1,979');
    expect(formatTflops(4500)).toBe('4,500');
    expect(formatTflops(9000)).toBe('9,000');
    expect(formatTflops(13500)).toBe('13,500');
    expect(formatTflops(10066)).toBe('10,066');
  });

  it('returns em dash for null', () => {
    expect(formatTflops(null)).toBe('—');
  });

  it('formats zero', () => {
    expect(formatTflops(0)).toBe('0');
  });
});

describe('formatNullable', () => {
  it('returns the string when not null', () => {
    expect(formatNullable('InfiniBand NDR')).toBe('InfiniBand NDR');
    expect(formatNullable('400 Gbit/s')).toBe('400 Gbit/s');
  });

  it('returns N/A for null', () => {
    expect(formatNullable(null)).toBe('N/A');
  });
});

describe('getScaleUpDomainMemory', () => {
  it('computes domain memory for B200 SXM (8-GPU)', () => {
    const spec = { memory: '180 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('1.44 TB');
  });

  it('computes domain memory for NVL72 systems', () => {
    const spec = { memory: '192 GB', scaleUpWorldSize: 72 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('13.82 TB');
  });

  it('returns TB for all values including sub-1 TB (H100)', () => {
    const spec = { memory: '80 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('0.64 TB');
  });

  it('computes H200 domain memory correctly', () => {
    const spec = { memory: '141 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('1.13 TB');
  });

  it('computes B300 SXM domain memory correctly', () => {
    const spec = { memory: '268 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('2.14 TB');
  });

  it('computes GB300 NVL72 domain memory correctly', () => {
    const spec = { memory: '288 GB', scaleUpWorldSize: 72 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('20.74 TB');
  });

  it('computes MI325X domain memory correctly', () => {
    const spec = { memory: '256 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('2.05 TB');
  });

  it('computes MI355X domain memory correctly', () => {
    const spec = { memory: '288 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemory(spec)).toBe('2.3 TB');
  });
});

describe('getTopologyConfig', () => {
  it('returns null for NVL72 GPUs (no scale-out)', () => {
    const gb200 = GPU_SPECS.find((s) => s.name === 'GB200 NVL72')!;
    const gb300 = GPU_SPECS.find((s) => s.name === 'GB300 NVL72')!;
    expect(getTopologyConfig(gb200)).toBeNull();
    expect(getTopologyConfig(gb300)).toBeNull();
  });

  it('returns 8-rail config for H200 SXM with 4 spine switches and 32 servers', () => {
    const h200 = GPU_SPECS.find((s) => s.name === 'H200 SXM')!;
    const config = getTopologyConfig(h200)!;
    expect(config.railCount).toBe(8);
    expect(config.gpuCount).toBe(8);
    expect(config.nicCount).toBe(8);
    // 1:1 NIC-to-leaf mapping for 8-rail
    expect(config.nicToLeaf).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(config.nicLabel).toBe('ConnectX-7 400G');
    expect(config.networkTech).toBe('InfiniBand NDR');
    // H100/H200: 32 servers per rail-pod, 1 rail-pod, 4 spine switches
    expect(config.spineLabel).toBe('25.6T NVIDIA Quantum-2 QM9790');
    expect(config.spineCount).toBe(4);
    expect(config.serversPerPod).toBe(32);
    expect(config.podCount).toBe(1);
  });

  it('returns 4-rail config for B200 SXM with 8 NICs, 4 leaf switches, 4 pods of 4 servers', () => {
    const b200 = GPU_SPECS.find((s) => s.name === 'B200 SXM')!;
    const config = getTopologyConfig(b200)!;
    expect(config.railCount).toBe(4);
    expect(config.gpuCount).toBe(8);
    expect(config.nicCount).toBe(8); // Always 8 NICs, one per GPU
    // 2 NICs per leaf switch for 4-rail
    expect(config.nicToLeaf).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // B200: 4 rail-pods, 2 spine switches, 4 servers per pod
    expect(config.spineCount).toBe(2);
    expect(config.serversPerPod).toBe(4);
    expect(config.podCount).toBe(4);
    // B200 has separate leaf and spine switch models
    expect(config.switchLabel).toBe('12.8T Whitebox Leaf Tomahawk3');
    expect(config.spineLabel).toBe('25.6T Whitebox Tomahawk4');
  });

  it('returns config with correct switch label', () => {
    const h100 = GPU_SPECS.find((s) => s.name === 'H100 SXM')!;
    const config = getTopologyConfig(h100)!;
    expect(config.switchLabel).toBe('25.6T Arista Tomahawk4 7060DX5-64S');
  });

  it('all non-NVL72 GPUs return a topology config with spine and cluster data', () => {
    for (const spec of GPU_SPECS) {
      const config = getTopologyConfig(spec);
      if (spec.name.includes('NVL72')) {
        expect(config).toBeNull();
      } else {
        expect(config).not.toBeNull();
        expect(config!.railCount).toBeGreaterThan(0);
        expect(config!.gpuCount).toBeGreaterThan(0);
        expect(config!.spineCount).toBeGreaterThan(0);
        expect(config!.spineLabel).toBeTruthy();
        expect(config!.serversPerPod).toBeGreaterThan(0);
        expect(config!.podCount).toBeGreaterThan(0);
      }
    }
  });

  it('H100 SXM has 4 spine switches, 32 servers, 1 pod', () => {
    const h100 = GPU_SPECS.find((s) => s.name === 'H100 SXM')!;
    const config = getTopologyConfig(h100)!;
    expect(config.railCount).toBe(8);
    expect(config.spineCount).toBe(4);
    expect(config.serversPerPod).toBe(32);
    expect(config.podCount).toBe(1);
    // Same switch model for leaf and spine
    expect(config.switchLabel).toBe(config.spineLabel);
  });

  it('B300 SXM has 32 servers per pod, 1 pod, 4 spine switches', () => {
    const b300 = GPU_SPECS.find((s) => s.name === 'B300 SXM')!;
    const config = getTopologyConfig(b300)!;
    expect(config.serversPerPod).toBe(32);
    expect(config.podCount).toBe(1);
    expect(config.spineCount).toBe(4);
    expect(config.railCount).toBe(8);
  });

  it('MI300X/MI325X/MI355X have 64 servers per pod, 1 pod, 4 spine switches', () => {
    for (const name of ['MI300X', 'MI325X', 'MI355X']) {
      const spec = GPU_SPECS.find((s) => s.name === name)!;
      const config = getTopologyConfig(spec)!;
      expect(config.serversPerPod).toBe(64);
      expect(config.podCount).toBe(1);
      expect(config.spineCount).toBe(4);
      expect(config.railCount).toBe(8);
    }
  });

  it('spine count = half of leaf count when leaf & spine are the same model', () => {
    // General rule: spine = railCount / 2 when leaf and spine are the same switch
    // Applies to H100, H200, B300, MI300X, MI325X, MI355X
    for (const name of ['H100 SXM', 'H200 SXM', 'B300 SXM', 'MI300X', 'MI325X', 'MI355X']) {
      const spec = GPU_SPECS.find((s) => s.name === name)!;
      const config = getTopologyConfig(spec)!;
      expect(config.spineCount).toBe(config.railCount / 2);
    }
    // B200 is the exception (different leaf/spine models, special Google gIB SKU)
    const b200 = GPU_SPECS.find((s) => s.name === 'B200 SXM')!;
    const b200Config = getTopologyConfig(b200)!;
    expect(b200Config.spineCount).toBe(2);
    expect(b200Config.railCount).toBe(4);
  });
});

describe('getScaleUpDomainMemoryBw', () => {
  it('computes domain bandwidth for 8-GPU systems', () => {
    const spec = { memoryBandwidth: '8 TB/s', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryBw(spec)).toBe('64 TB/s');
  });

  it('computes domain bandwidth for NVL72 systems', () => {
    const spec = { memoryBandwidth: '8 TB/s', scaleUpWorldSize: 72 } as GpuSpec;
    expect(getScaleUpDomainMemoryBw(spec)).toBe('576 TB/s');
  });

  it('handles fractional bandwidth', () => {
    const spec = { memoryBandwidth: '3.35 TB/s', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryBw(spec)).toBe('26.8 TB/s');
  });

  it('computes H200 domain bandwidth correctly', () => {
    const spec = { memoryBandwidth: '4.8 TB/s', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryBw(spec)).toBe('38.4 TB/s');
  });

  it('computes MI300X domain bandwidth correctly', () => {
    const spec = { memoryBandwidth: '5.3 TB/s', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryBw(spec)).toBe('42.4 TB/s');
  });
});

describe('scale-up topology values', () => {
  it('H100/H200 have Switched 4-rail Optimized', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('H100 SXM').scaleUpTopology).toBe('Switched 4-rail Optimized');
    expect(find('H200 SXM').scaleUpTopology).toBe('Switched 4-rail Optimized');
  });

  it('B200/B300 have Switched 2-rail Optimized', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('B200 SXM').scaleUpTopology).toBe('Switched 2-rail Optimized');
    expect(find('B300 SXM').scaleUpTopology).toBe('Switched 2-rail Optimized');
  });

  it('MI300X/MI325X/MI355X have Full Mesh', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('MI300X').scaleUpTopology).toBe('Full Mesh');
    expect(find('MI325X').scaleUpTopology).toBe('Full Mesh');
    expect(find('MI355X').scaleUpTopology).toBe('Full Mesh');
  });

  it('GB200/GB300 NVL72 have Switched 18-rail Optimized', () => {
    const find = (name: string) => GPU_SPECS.find((s) => s.name === name)!;
    expect(find('GB200 NVL72').scaleUpTopology).toBe('Switched 18-rail Optimized');
    expect(find('GB300 NVL72').scaleUpTopology).toBe('Switched 18-rail Optimized');
  });
});

describe('getScaleUpTopologyConfig', () => {
  it('returns switched config with 4 NVSwitches for H100/H200', () => {
    const h100 = GPU_SPECS.find((s) => s.name === 'H100 SXM')!;
    const config = getScaleUpTopologyConfig(h100);
    expect(config.type).toBe('switched');
    expect(config.gpuCount).toBe(8);
    expect(config.switchCount).toBe(4);
    expect(config.techName).toBe('NVLink 4.0');
    expect(config.nodeCount).toBe(1);
    expect(config.gpusPerNode).toBe(8);
  });

  it('returns switched config with 2 NVSwitches for B200/B300', () => {
    const b200 = GPU_SPECS.find((s) => s.name === 'B200 SXM')!;
    const config = getScaleUpTopologyConfig(b200);
    expect(config.type).toBe('switched');
    expect(config.gpuCount).toBe(8);
    expect(config.switchCount).toBe(2);
    expect(config.techName).toBe('NVLink 5.0');
    expect(config.nodeCount).toBe(1);
    expect(config.gpusPerNode).toBe(8);
  });

  it('returns mesh config for AMD GPUs', () => {
    const mi300 = GPU_SPECS.find((s) => s.name === 'MI300X')!;
    const config = getScaleUpTopologyConfig(mi300);
    expect(config.type).toBe('mesh');
    expect(config.gpuCount).toBe(8);
    expect(config.switchCount).toBe(0);
    expect(config.techName).toBe('Infinity Fabric');
    expect(config.nodeCount).toBe(1);
    expect(config.gpusPerNode).toBe(8);
  });

  it('returns switched config with 18 NVSwitches for NVL72', () => {
    const gb200 = GPU_SPECS.find((s) => s.name === 'GB200 NVL72')!;
    const config = getScaleUpTopologyConfig(gb200);
    expect(config.type).toBe('switched');
    expect(config.gpuCount).toBe(72);
    expect(config.switchCount).toBe(18);
    expect(config.techName).toBe('NVLink 5.0');
    expect(config.nodeCount).toBe(18);
    expect(config.gpusPerNode).toBe(4);
  });

  it('MI355X uses 5th Gen Infinity Fabric in config', () => {
    const mi355 = GPU_SPECS.find((s) => s.name === 'MI355X')!;
    const config = getScaleUpTopologyConfig(mi355);
    expect(config.type).toBe('mesh');
    expect(config.techName).toBe('5th Gen Infinity Fabric');
    expect(config.totalBandwidth).toBe('576 GB/s');
  });

  it('all GPUs return a valid scale-up topology config', () => {
    for (const spec of GPU_SPECS) {
      const config = getScaleUpTopologyConfig(spec);
      expect(config).not.toBeNull();
      expect(config.gpuCount).toBeGreaterThan(0);
      expect(config.techName).toBeTruthy();
      expect(config.totalBandwidth).toBeTruthy();
    }
  });
});

describe('parseNumericFromString', () => {
  it('parses integer values from strings with units', () => {
    expect(parseNumericFromString('80 GB')).toBe(80);
    expect(parseNumericFromString('192 GB')).toBe(192);
    expect(parseNumericFromString('288 GB')).toBe(288);
  });

  it('parses decimal values from strings with units', () => {
    expect(parseNumericFromString('3.35 TB/s')).toBe(3.35);
    expect(parseNumericFromString('4.8 TB/s')).toBe(4.8);
    expect(parseNumericFromString('8 TB/s')).toBe(8);
  });

  it('parses bandwidth values', () => {
    expect(parseNumericFromString('450 GB/s')).toBe(450);
    expect(parseNumericFromString('900 GB/s')).toBe(900);
    expect(parseNumericFromString('400 Gbit/s')).toBe(400);
    expect(parseNumericFromString('800 Gbit/s')).toBe(800);
  });

  it('returns null for null input', () => {
    expect(parseNumericFromString(null)).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseNumericFromString('N/A')).toBeNull();
  });
});

describe('getScaleUpDomainMemoryNumeric', () => {
  it('computes domain memory in TB for 8-GPU system', () => {
    const spec = { memory: '180 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryNumeric(spec)).toBeCloseTo(1.44, 2);
  });

  it('computes domain memory in TB for NVL72 system', () => {
    const spec = { memory: '192 GB', scaleUpWorldSize: 72 } as GpuSpec;
    expect(getScaleUpDomainMemoryNumeric(spec)).toBeCloseTo(13.824, 2);
  });

  it('computes H100 domain memory correctly', () => {
    const spec = { memory: '80 GB', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryNumeric(spec)).toBeCloseTo(0.64, 2);
  });

  it('computes GB300 NVL72 domain memory correctly', () => {
    const spec = { memory: '288 GB', scaleUpWorldSize: 72 } as GpuSpec;
    expect(getScaleUpDomainMemoryNumeric(spec)).toBeCloseTo(20.736, 2);
  });
});

describe('getScaleUpDomainMemoryBwNumeric', () => {
  it('computes domain bandwidth for 8-GPU system', () => {
    const spec = { memoryBandwidth: '8 TB/s', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryBwNumeric(spec)).toBe(64);
  });

  it('computes domain bandwidth for NVL72 system', () => {
    const spec = { memoryBandwidth: '8 TB/s', scaleUpWorldSize: 72 } as GpuSpec;
    expect(getScaleUpDomainMemoryBwNumeric(spec)).toBe(576);
  });

  it('handles fractional bandwidth', () => {
    const spec = { memoryBandwidth: '3.35 TB/s', scaleUpWorldSize: 8 } as GpuSpec;
    expect(getScaleUpDomainMemoryBwNumeric(spec)).toBeCloseTo(26.8, 1);
  });
});

describe('GPU_CHART_METRICS', () => {
  it('contains 10 metrics', () => {
    expect(GPU_CHART_METRICS).toHaveLength(10);
  });

  it('all metrics have required fields', () => {
    for (const metric of GPU_CHART_METRICS) {
      expect(metric.key).toBeTruthy();
      expect(metric.label).toBeTruthy();
      expect(metric.unit).toBeTruthy();
      expect(typeof metric.getValue).toBe('function');
    }
  });

  it('memory metric extracts correct value for H100 SXM', () => {
    const h100 = GPU_SPECS.find((s) => s.name === 'H100 SXM')!;
    const memoryMetric = GPU_CHART_METRICS.find((m) => m.key === 'memory')!;
    expect(memoryMetric.getValue(h100)).toBe(80);
  });

  it('fp4 metric returns null for H100 (no FP4 support)', () => {
    const h100 = GPU_SPECS.find((s) => s.name === 'H100 SXM')!;
    const fp4Metric = GPU_CHART_METRICS.find((m) => m.key === 'fp4')!;
    expect(fp4Metric.getValue(h100)).toBeNull();
  });

  it('fp4 metric returns value for B200 SXM', () => {
    const b200 = GPU_SPECS.find((s) => s.name === 'B200 SXM')!;
    const fp4Metric = GPU_CHART_METRICS.find((m) => m.key === 'fp4')!;
    expect(fp4Metric.getValue(b200)).toBe(9000);
  });

  it('fp8 metric returns correct value for MI355X', () => {
    const mi355x = GPU_SPECS.find((s) => s.name === 'MI355X')!;
    const fp8Metric = GPU_CHART_METRICS.find((m) => m.key === 'fp8')!;
    expect(fp8Metric.getValue(mi355x)).toBe(5033);
  });

  it('scaleOutBandwidth metric returns null for NVL72 systems', () => {
    const gb200 = GPU_SPECS.find((s) => s.name === 'GB200 NVL72')!;
    const scaleOutMetric = GPU_CHART_METRICS.find((m) => m.key === 'scaleOutBandwidth')!;
    expect(scaleOutMetric.getValue(gb200)).toBeNull();
  });

  it('domainMemory metric computes correct value for GB300 NVL72', () => {
    const gb300 = GPU_SPECS.find((s) => s.name === 'GB300 NVL72')!;
    const domainMemMetric = GPU_CHART_METRICS.find((m) => m.key === 'domainMemory')!;
    expect(domainMemMetric.getValue(gb300)).toBeCloseTo(20.736, 2);
  });

  it('domainMemoryBandwidth metric computes correct value for B300 SXM', () => {
    const b300 = GPU_SPECS.find((s) => s.name === 'B300 SXM')!;
    const domainBwMetric = GPU_CHART_METRICS.find((m) => m.key === 'domainMemoryBandwidth')!;
    expect(domainBwMetric.getValue(b300)).toBe(64);
  });

  it('scaleUpBandwidth metric returns correct values', () => {
    const metric = GPU_CHART_METRICS.find((m) => m.key === 'scaleUpBandwidth')!;
    const h100 = GPU_SPECS.find((s) => s.name === 'H100 SXM')!;
    const b200 = GPU_SPECS.find((s) => s.name === 'B200 SXM')!;
    const mi355x = GPU_SPECS.find((s) => s.name === 'MI355X')!;
    expect(metric.getValue(h100)).toBe(450);
    expect(metric.getValue(b200)).toBe(900);
    expect(metric.getValue(mi355x)).toBe(576);
  });

  it('all metrics return a number (not null) for at least some GPUs', () => {
    for (const metric of GPU_CHART_METRICS) {
      const values = GPU_SPECS.map((spec) => metric.getValue(spec)).filter((v) => v !== null);
      expect(values.length).toBeGreaterThan(0);
    }
  });
});
