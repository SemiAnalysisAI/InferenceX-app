import { benchmarkPointIngestKey, type BenchmarkPersistenceInput } from './benchmark-ingest.js';
import type { PowerAudit } from './benchmark-mapper.js';
import { recoveredPowerAudit } from './power-audit-validations.js';

export interface BenchmarkPowerAuditEvidence {
  resultFile: string;
  validations: Record<string, Record<string, unknown>>;
}

/** One run's exact sibling evidence also applies to its later aggregate copies. */
export function createBenchmarkPowerAuditRecovery() {
  const recovered = new Map<string, PowerAudit>();
  return <T extends BenchmarkPersistenceInput>(
    row: T,
    evidence?: BenchmarkPowerAuditEvidence,
  ): T => {
    if (row.benchmarkType !== 'agentic_traces' || row.powerAudit !== undefined) return row;
    const key = benchmarkPointIngestKey(row);
    if (evidence) {
      const matches = Object.entries(evidence.validations).filter(([, validation]) => {
        const window = validation.selected_window;
        if (
          validation.result_file !== evidence.resultFile ||
          !window ||
          typeof window !== 'object' ||
          Array.isArray(window) ||
          !('concurrency' in window) ||
          window.concurrency !== row.conc
        )
          return false;
        return true;
      });
      // Ambiguous/missing evidence must not establish new provenance.
      if (matches.length !== 1) return row;
      const audit = recoveredPowerAudit(...matches[0]);
      if (!audit) return row;
      recovered.set(key, audit);
    }
    const audit = recovered.get(key);
    return audit ? { ...row, powerAudit: audit } : row;
  };
}
