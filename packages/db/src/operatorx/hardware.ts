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
    memoryBandwidthTBs: 1.6,
    memoryBandwidthAssumed: true,
    source:
      'Ascend-ubench.md, hardware configuration and section 5; Huawei Ascend 950 white paper, table 3-1',
    qualification:
      '28-Cube Ascend950PR_9579: dense Cube peaks of 378 BF16 and 756 FP8 TFLOPS, excluding Vector compute. The 1.6 TB/s bandwidth is the report assumption for the 128 GB configuration; exact memory/ECC configuration is unresolved. FP4 remains unregistered.',
  },
};
