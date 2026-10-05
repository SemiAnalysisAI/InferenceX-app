/** Recorded deployment configuration. Missing fields remain unknown, never implicit defaults. */
export interface VideoDeploymentRecord {
  gpusPerReplica?: number | null;
  ring?: number | null;
  cfg?: number | null;
  offload?: {
    ditCpu?: boolean | null;
    ditLayerwise?: boolean | null;
    textEncoderCpu?: boolean | null;
    imageEncoderCpu?: boolean | null;
    vaeCpu?: boolean | null;
  } | null;
  encoderParallel?: string | null;
  /** Observed request batch size; a configured limit alone does not populate this. */
  batchSize?: number | null;
  maxBatchSize?: number | null;
  batchDelayMs?: number | null;
  scheduling?: string | null;
  engine?: string | null;
  precision?: string | null;
  acceleration?: string | null;
  /** Canonical recorded generation settings in addition to the canonical workload identity. */
  generationKey?: string | null;
  /** Retained configuration source, including the basis for any replica inference. */
  configEvidence?: string | null;
}

export interface VideoHardwareHealth {
  status: 'pass' | 'fail' | 'unknown';
  reason: string | null;
  evidence: string | null;
}

export interface VideoDeploymentFields {
  deployment?: VideoDeploymentRecord | null;
  hardwareHealth?: VideoHardwareHealth | null;
}
