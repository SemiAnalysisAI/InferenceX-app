import {
  buildComparison,
  comparisonCaseKey,
  type Comparison,
  type ComparisonHardware,
  type ComparisonInput,
  type ComparisonOp,
  type ComparisonRow,
  type ComparisonWorkload,
} from './compare';

/**
 * Bump when persisted shape/derivation changes, then backfill existing runs.
 * Includes normalize, compare, describe, workloads, and model display mappings.
 */
export const OPERATORX_COMPARISON_VERSION = 2;

/** The op families each run stores a comparison for. */
export const OPERATORX_COMPARISON_OPS = [
  'gemm',
  'moe',
  'attention',
] as const satisfies readonly ComparisonOp[];

interface SelectedRow {
  row: ComparisonRow;
  comparison: Comparison;
}

/** Apply the raw reader's missing-only fallback even within one run. */
export function buildRunComparison(op: ComparisonOp, input: ComparisonInput): Comparison {
  const results = new Map<string, ComparisonInput['dataset']['results'][number]>();
  for (const result of input.dataset.results) {
    const key = comparisonCaseKey(op, input.runner, result);
    if (key === null) continue;
    const previous = results.get(key);
    if (!previous || (previous.status === 'missing' && result.status !== 'missing')) {
      results.set(key, result);
    }
  }
  return buildComparison(op, [
    {
      runner: input.runner,
      dataset: { run: input.dataset.run, results: [...results.values()] },
    },
  ]);
}

/**
 * Merge ingest-time projections in the same newest-first order as the raw reader.
 * Only missing results may fall back to an older run; explicit failures remain.
 * Grouping selected rows by their source run preserves the raw reader's ordering,
 * including backend ties, workload defaults, and model/kernel dictionary indices.
 */
export function mergeRunComparisons(op: ComparisonOp, comparisons: Comparison[]): Comparison {
  const selected = new Map<string, SelectedRow>();
  for (const comparison of comparisons) {
    if (comparison.op !== op) throw new Error(`Expected ${op} comparison, got ${comparison.op}`);
    for (const row of comparison.rows) {
      const key = `${row.hardware}|${row.caseKey}`;
      const previous = selected.get(key);
      if (!previous || (previous.row.status === 'missing' && row.status !== 'missing')) {
        selected.set(key, { row, comparison });
      }
    }
  }

  const byRun = new Map<string, SelectedRow[]>();
  for (const value of selected.values()) {
    const rows = byRun.get(value.row.runId) ?? [];
    rows.push(value);
    byRun.set(value.row.runId, rows);
  }

  const hardware = new Map<string, ComparisonHardware>();
  const workloads = new Map<
    string,
    { source: Pick<ComparisonWorkload, 'id' | 'label'>; cases: Set<string>; hardware: Set<string> }
  >();
  const rows: ComparisonRow[] = [];
  for (const runRows of byRun.values()) {
    for (const { row, comparison } of runRows) {
      rows.push(row);
      const sourceHardware = comparison.hardware.find((h) => h.id === row.hardware);
      const sourceRun = sourceHardware?.runs.find((run) => run.runId === row.runId);
      if (!sourceHardware || !sourceRun) throw new Error('Comparison row has no source run');
      let h = hardware.get(row.hardware);
      if (!h) {
        h = { id: sourceHardware.id, runner: sourceHardware.runner, runs: [] };
        hardware.set(h.id, h);
      }
      if (!h.runs.some((run) => run.runId === sourceRun.runId)) h.runs.push(sourceRun);

      // Backend is the final suffix; coverage counts operation arguments only.
      const caseKey = row.caseKey.slice(0, row.caseKey.lastIndexOf('|'));
      for (const id of row.workloads) {
        let workload = workloads.get(id);
        if (!workload) {
          const source = comparison.workloads.find((w) => w.id === id);
          if (!source) throw new Error('Comparison row has no workload');
          workload = {
            source: { id: source.id, label: source.label },
            cases: new Set(),
            hardware: new Set(),
          };
          workloads.set(id, workload);
        }
        workload.cases.add(caseKey);
        workload.hardware.add(row.hardware);
      }
    }
  }
  return {
    op,
    hardware: [...hardware.values()],
    workloads: [...workloads.values()]
      .map((w) => ({ ...w.source, cases: w.cases.size, hardware: [...w.hardware].sort() }))
      .sort((a, b) => b.hardware.length - a.hardware.length || a.label.localeCompare(b.label)),
    rows,
  };
}
