import type { EvalRow } from '@semianalysisai/inferencex-db/queries/evaluations';

export interface CompactEvalRows {
  readonly configs: CompactEvalConfig[];
  readonly runs: [timestamp: string, runUrl: string | null][];
  readonly rows: [
    id: number,
    config: number,
    task: string,
    date: string,
    conc: number | null,
    run: number,
    metrics: Record<string, number>,
    specAlgorithm: string | null,
    specDraftModel: string | null,
  ][];
}

type CompactEvalConfig = [
  configId: number,
  hardware: string,
  framework: string,
  model: string,
  precision: string,
  specMethod: string,
  disagg: boolean,
  isMultinode: boolean,
  prefillTp: number,
  prefillEp: number,
  prefillDpAttention: boolean,
  prefillNumWorkers: number,
  decodeTp: number,
  decodeEp: number,
  decodeDpAttention: boolean,
  decodeNumWorkers: number,
  numPrefillGpu: number,
  numDecodeGpu: number,
];

const DASHBOARD_METRIC_KEYS = ['em_strict', 'em_strict_se', 'score', 'score_se', 'dp'];

export function compactEvalRows(evalRows: readonly EvalRow[]): CompactEvalRows {
  const configIndex = new Map<number, number>();
  const runIndex = new Map<string, number>();
  const compact: CompactEvalRows = { configs: [], runs: [], rows: [] };
  for (const row of evalRows) {
    let config = configIndex.get(row.config_id);
    if (config === undefined) {
      config = compact.configs.length;
      configIndex.set(row.config_id, config);
      compact.configs.push([
        row.config_id,
        row.hardware,
        row.framework,
        row.model,
        row.precision,
        row.spec_method,
        row.disagg,
        row.is_multinode,
        row.prefill_tp,
        row.prefill_ep,
        row.prefill_dp_attention,
        row.prefill_num_workers,
        row.decode_tp,
        row.decode_ep,
        row.decode_dp_attention,
        row.decode_num_workers,
        row.num_prefill_gpu,
        row.num_decode_gpu,
      ]);
    }
    const runKey = row.run_url === null ? row.timestamp : `${row.timestamp}|${row.run_url}`;
    let run = runIndex.get(runKey);
    if (run === undefined) {
      run = compact.runs.length;
      runIndex.set(runKey, run);
      compact.runs.push([row.timestamp, row.run_url]);
    }
    const metrics: Record<string, number> = {};
    for (const key of DASHBOARD_METRIC_KEYS) {
      if (Object.hasOwn(row.metrics, key)) metrics[key] = row.metrics[key]!;
    }
    compact.rows.push([
      row.id,
      config,
      row.task,
      row.date,
      row.conc,
      run,
      metrics,
      row.spec_algorithm,
      row.spec_draft_model,
    ]);
  }
  return compact;
}

export function expandEvalRows({ configs, runs, rows }: CompactEvalRows): EvalRow[] {
  return rows.map(
    ([id, config, task, date, conc, run, metrics, spec_algorithm, spec_draft_model]) => {
      const [
        config_id,
        hardware,
        framework,
        model,
        precision,
        spec_method,
        disagg,
        is_multinode,
        prefill_tp,
        prefill_ep,
        prefill_dp_attention,
        prefill_num_workers,
        decode_tp,
        decode_ep,
        decode_dp_attention,
        decode_num_workers,
        num_prefill_gpu,
        num_decode_gpu,
      ] = configs[config]!;
      const [timestamp, run_url] = runs[run]!;
      return {
        id,
        config_id,
        hardware,
        framework,
        model,
        precision,
        spec_method,
        spec_algorithm,
        spec_draft_model,
        disagg,
        is_multinode,
        prefill_tp,
        prefill_ep,
        prefill_dp_attention,
        prefill_num_workers,
        decode_tp,
        decode_ep,
        decode_dp_attention,
        decode_num_workers,
        num_prefill_gpu,
        num_decode_gpu,
        task,
        date,
        conc,
        metrics,
        timestamp,
        run_url,
      };
    },
  );
}
