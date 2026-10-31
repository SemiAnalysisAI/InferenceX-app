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
      'Ascend-ubench.md, hardware configuration and section 5; Huawei Ascend 950 white paper, table 3-1; npu-smi info -t memory on the benchmarked Ascend950PR_9579 (driver 25.7.rc1.6, 31 Oct 2026): HBM Capacity 131072 MB, HBM Clock Speed 3200 MHz; package photo showing eight HBM stacks; Huawei npu-smi reference example (Ascend 910, HBM Clock Speed 1200 MHz)',
    qualification:
      '28-Cube Ascend950PR_9579: dense Cube peaks of 378 BF16 and 756 FP8 TFLOPS, excluding Vector compute. The 1.6384 TB/s bandwidth is derived, not published: eight HBM stacks (visible on the package) × 204.8 GB/s. The card reports a 3200 MHz HBM clock (CK, the same npu-smi convention as the Ascend 910’s 1200 MHz for 2.4 Gbps HBM2). With a 1:2 CK:WCK ratio and data on both WCK edges that is 12.8 Gbps per pin, so 128 bits per stack; if npu-smi instead reports WCK, 6.4 Gbps and 256 bits. Either split gives 1.6384 TB/s, the only such peak that rounds to Huawei’s 1.6 TB/s, and seven stacks give the Atlas 350’s 112 GB and 1.4 TB/s. Width and pin rate are not published, and the exact memory/ECC configuration is not counter-verified. FP4 remains unregistered.',
  },
};
