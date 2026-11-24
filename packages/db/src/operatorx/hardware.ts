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
      'Ascend-ubench.md, hardware configuration and section 5; Huawei Ascend 950 white paper, table 3-1; npu-smi info -t memory on the benchmarked card (HBM Clock Speed 3200 MHz)',
    qualification:
      '28-Cube Ascend950PR_9579: dense Cube peaks of 378 BF16 and 756 FP8 TFLOPS, excluding Vector compute. Peak memory bandwidth is 1.6384 TB/s: 8 HBM stacks × 256 bits × 6.4 Gbps per pin (npu-smi HBM clock 3200 MHz), which Huawei rounds to 1.6 TB/s. FP4 remains unregistered.',
  },
  // Google Cloud TPU7x (Ironwood) docs, https://docs.cloud.google.com/tpu/docs/tpu7x:
  // 2307 BF16 / 4614 FP8 TFLOPS and 7380 GB/s HBM per chip, exposed as two devices
  // (one per chiplet). OperatorX times one device, so these are half a chip. The best
  // measured GEMMs (1042 BF16 TFLOPS, 2005 FP8, 3.29 TB/s) sit at 87-90% of them.
  tpuv7: {
    label: 'TPU7x',
    peakTflops: { bf16: 1153.5, fp8: 2307, fp4: null },
    memoryBandwidthTBs: 3.69,
    memoryBandwidthAssumed: true,
    source:
      'Google Cloud TPU7x (Ironwood) documentation, system architecture table: per chip 2307 BF16 and 4614 FP8 peak TFLOPS, 7380 GB/s HBM bandwidth, two TensorCores; JAX exposes each chip as two devices, one per chiplet',
    qualification:
      'A TPU7x device is one of the two chiplets of a chip (one TensorCore, 96 GiB HBM), and OperatorX measures each case per device. Peaks are half of the per-chip figures: 1153.5 dense BF16 and 2307 dense FP8 TFLOPS, and 3.69 TB/s HBM bandwidth (half of 7.38 TB/s, assuming an even split between chiplets). TPU7x has no native FP4. No ICI reference is registered, so split cases with collectives have no roofline bound.',
  },
};
