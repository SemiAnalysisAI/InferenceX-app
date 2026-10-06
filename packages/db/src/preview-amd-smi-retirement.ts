/** Read-only source inventory for the legacy AMD-SMI power retirement policy. */
import { getDb } from './connection.js';
import {
  AMD_HARDWARE,
  classifyDatabaseRow,
  readSourceEvidence,
  type DatabasePowerRow,
} from './lib/amd-smi-retirement-inventory.js';

function option(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`Invalid ${label} in database response`);
  return number;
}

function databasePowerRow(value: Record<string, unknown>): DatabasePowerRow {
  const linked = Array.isArray(value.linked_series) ? value.linked_series : [];
  if (!isRecord(value.metrics) || typeof value.hardware !== 'string') {
    throw new Error('Unexpected benchmark row shape');
  }
  return {
    resultId: String(value.result_id),
    githubRunId: requiredNumber(value.github_run_id, 'GitHub run ID'),
    runAttempt: requiredNumber(value.run_attempt, 'run attempt'),
    headSha: String(value.head_sha),
    hardware: value.hardware,
    metrics: value.metrics,
    hasWorkers: value.workers !== null,
    linkedSeries: linked.map((item: unknown) => {
      if (!isRecord(item)) throw new Error('Unexpected telemetry series shape');
      if (
        typeof item.vendor !== 'string' ||
        typeof item.artifact_name !== 'string' ||
        typeof item.csv_sha256 !== 'string'
      )
        throw new Error('Incomplete telemetry series identity');
      return {
        id: String(item.id),
        vendor: item.vendor,
        artifactName: item.artifact_name,
        csvSha256: item.csv_sha256,
      };
    }),
  };
}

async function main() {
  const evidencePath = option('--evidence');
  const artifactRoot = option('--artifact-root');
  if (!evidencePath || !artifactRoot) {
    throw new Error(
      'Usage: bun preview-amd-smi-retirement.ts --evidence FILE --artifact-root DIR [--db]',
    );
  }
  const sources = readSourceEvidence(evidencePath, artifactRoot);
  const report: Record<string, unknown> = {
    mode: 'read_only_preview',
    policy: 'retire_direct_amd_smi_power',
    observedAt: new Date().toISOString(),
    sourceEvidenceCount: sources.length,
    verifiedSources: sources,
    databaseChecked: false,
  };
  if (process.argv.includes('--db')) {
    if (!process.env.DATABASE_READONLY_URL) {
      throw new Error('--db requires DATABASE_READONLY_URL; no write URL is used');
    }
    const sql = getDb();
    const rows = await sql`
      select br.id::text as result_id, wr.github_run_id, wr.run_attempt, wr.head_sha,
        c.hardware, br.metrics, br.workers,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'vendor', s.vendor, 'artifact_name', s.artifact_name,
            'csv_sha256', s.csv_sha256
          ) order by s.id)
          from benchmark_result_gpu_metrics l
          join gpu_metric_series s on s.id = l.series_id
          where l.benchmark_result_id = br.id
        ), '[]'::jsonb) as linked_series
      from benchmark_results br
      join configs c on c.id = br.config_id
      join workflow_runs wr on wr.id = br.workflow_run_id
      where c.hardware = any(${AMD_HARDWARE}::text[])
      order by br.id
    `;
    const inventory = rows.map(databasePowerRow).map((row) => ({
      resultId: row.resultId,
      githubRunId: row.githubRunId,
      runAttempt: row.runAttempt,
      headSha: row.headSha,
      hardware: row.hardware,
      hasWorkers: row.hasWorkers,
      linkedSeries: row.linkedSeries,
      ...classifyDatabaseRow(row, sources),
    }));
    const relevant = inventory.filter(
      (row) => row.powerKeys.length > 0 || row.linkedSeries.length > 0,
    );
    report.databaseChecked = true;
    report.amdRowsRead = rows.length;
    report.powerOrTelemetryRows = relevant.length;
    const candidates = relevant.filter((row) => row.status === 'verified_legacy_amd_smi');
    const unresolved = relevant.filter((row) => row.status !== 'verified_legacy_amd_smi');
    report.verifiedRetirementCandidates = candidates;
    report.unresolvedRows = unresolved;
    report.completeSourceCoverage = unresolved.length === 0;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
