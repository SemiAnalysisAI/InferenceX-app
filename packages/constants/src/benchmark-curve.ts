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

function curveKey(row: BenchmarkCurveInput, foldTopology: boolean): string {
  return JSON.stringify([
    row.model ?? '',
    row.hardware,
    row.framework,
    row.precision,
    row.benchmark_type ?? 'single_turn',
    row.isl ?? null,
    row.osl ?? null,
    foldTopology ? '' : row.spec_method,
    foldTopology ? false : row.disagg,
    foldTopology ? '' : (row.offload_mode ?? 'off'),
  ]);
}

export function benchmarkCurveScope(row: BenchmarkCurveInput): string {
  return curveKey(row, row.benchmark_type === 'agentic_traces');
}

/**
 * One topology line inside a curve scope: the scope without the AgentX fold, so a
 * fixed-sequence scope holds exactly one line.
 */
export function benchmarkCurveLine(row: BenchmarkCurveInput): string {
  return curveKey(row, false);
}

export type CurveLineImages = ReadonlyMap<string, string>;

/**
 * The image of each line one run contributes to a curve, or null when a line has a
 * missing or second image. Mirrors `line_images` in packages/db/src/queries/benchmarks.ts.
 */
export function curveLineImages(
  rows: readonly (BenchmarkCurveInput & { image?: string | null })[],
): CurveLineImages | null {
  const images = new Map<string, string>();
  for (const row of rows) {
    const line = benchmarkCurveLine(row);
    if (typeof row.image !== 'string' || (images.get(line) ?? row.image) !== row.image) return null;
    images.set(line, row.image);
  }
  return images;
}

/**
 * Extends an append-only chain with the run before it when every line both hold
 * keeps its image. Null ends the chain.
 */
export function extendCurveLineImages(
  chain: CurveLineImages | null,
  older: CurveLineImages | null,
): CurveLineImages | null {
  if (!chain || !older) return null;
  for (const [line, image] of older) if ((chain.get(line) ?? image) !== image) return null;
  return new Map([...older, ...chain]);
}
