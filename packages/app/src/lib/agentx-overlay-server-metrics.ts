import {
  agentxServerMetricsInput,
  deriveAgentxServerMetrics,
} from '@semianalysisai/inferencex-db/etl/agentx-server-metrics/index';

import type { BenchmarkRow } from '@/lib/api';

const SCRAPE_CSV =
  /(?:^|\/)(?:conc_(?<conc>\d+)\/)?(?:aiperf_artifacts|trace_replay)\/server_metrics_export\.csv$/u;

export function isScrapeCsvEntry(entryName: string): boolean {
  return SCRAPE_CSV.test(entryName);
}

/** The point's scrape summary: its `conc_<N>/` copy in multi-point artifacts, else the only one. */
export function pointScrapeCsv(entries: ReadonlyMap<string, Buffer>, conc: number): string | null {
  let single: string | null = null;
  for (const [name, data] of entries) {
    const match = SCRAPE_CSV.exec(name);
    if (!match) continue;
    if (match.groups?.conc === undefined) single = data.toString('utf8');
    else if (Number(match.groups.conc) === conc) return data.toString('utf8');
  }
  return single;
}

/**
 * Overlay rows get the same AgentX server metrics as ingested rows. Overlays
 * read no server logs, so their KV pools stay absent.
 */
export function withOverlayServerMetrics(
  row: BenchmarkRow,
  scrapeCsv: string | null,
): BenchmarkRow {
  const { metrics } = deriveAgentxServerMetrics(
    agentxServerMetricsInput(
      {
        framework: row.framework,
        disagg: row.disagg,
        prefillTp: row.prefill_tp,
        prefillDpAttn: row.prefill_dp_attention,
        prefillNumWorkers: row.prefill_num_workers,
        decodeTp: row.decode_tp,
        decodeDpAttn: row.decode_dp_attention,
        decodeNumWorkers: row.decode_num_workers,
      },
      row.metrics,
      { scrapeCsv, logFiles: null },
    ),
  );
  const derived = Object.fromEntries(
    Object.entries(metrics).filter((entry): entry is [string, number] => entry[1] !== null),
  );
  return { ...row, metrics: { ...row.metrics, ...derived } };
}
