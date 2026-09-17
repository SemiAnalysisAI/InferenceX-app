/** Canonical replacement scope. Keep in sync with SQL benchmark_curve_scope. */
export interface BenchmarkCurveInput {
  model?: string;
  hardware: string;
  framework: string;
  precision: string;
  benchmark_type?: string;
  isl?: number | null;
  osl?: number | null;
  spec_method: string;
  disagg: boolean;
  offload_mode?: string | null;
}

/** AgentX submits one curve across topology, decoding, and offload choices. */
export function benchmarkCurveScope(row: BenchmarkCurveInput): string {
  const agentic = row.benchmark_type === 'agentic_traces';
  return JSON.stringify([
    row.model ?? '',
    row.hardware,
    row.framework,
    row.precision,
    row.benchmark_type ?? 'single_turn',
    row.isl ?? null,
    row.osl ?? null,
    agentic ? '' : row.spec_method,
    agentic ? false : row.disagg,
    agentic ? '' : (row.offload_mode ?? 'off'),
  ]);
}
