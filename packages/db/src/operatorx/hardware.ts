/** OperatorX-only reference values; these do not imply a full system specification. */
export interface OperatorXHardwareReference {
  label: string;
  peakTflops: { bf16: number | null; fp8: number | null; fp4: number | null };
  memoryBandwidthTBs: number;
  memoryBandwidthAssumed: boolean;
  source: string;
  qualification: string;
}

export const OPERATORX_HARDWARE_REFERENCES: Record<string, OperatorXHardwareReference> = {
  ascend950pr: {
    label: '950PR',
    peakTflops: { bf16: 378, fp8: 756, fp4: null },
    memoryBandwidthTBs: 1.6384,
    memoryBandwidthAssumed: true,
    source:
      'Ascend-ubench.md, hardware configuration and section 5; Huawei Ascend 950 white paper, table 3-1; npu-smi info -t memory on the benchmarked Ascend950PR_9579 (driver 25.7.rc1.6, 31 Oct 2026): HBM Capacity 131072 MB, HBM Clock Speed 3200 MHz',
    qualification:
      '28-Cube Ascend950PR_9579: dense Cube peaks of 378 BF16 and 756 FP8 TFLOPS, excluding Vector compute. The 1.6384 TB/s bandwidth is derived, not published: Huawei quotes a rounded 1.6 TB/s for the 128 GB configuration, and the card reports a 3200 MHz HBM clock, which fits only a 4096-bit bus at 3.2 Gbps per pin (or 2048 bits at 6.4 Gbps), both 1.6384 TB/s. Bus width and the exact memory/ECC configuration are not published or counter-verified. FP4 remains unregistered.',
  },
};
