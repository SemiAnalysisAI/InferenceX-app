import fs from 'node:fs';
import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';
import { createAdminSql } from './etl/db-utils';
import {
  verifyPowerPublication,
  type PowerPublicationManifest,
  type PublishedPowerRow,
} from './etl/power-publication';

const manifestPath = process.argv[2];
if (!manifestPath)
  throw new Error('Usage: verify-power-publication.ts <ingest-manifest.json> [public-origin]');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PowerPublicationManifest;
if (
  manifest.version !== 1 ||
  !Number.isSafeInteger(manifest.runId) ||
  manifest.runId <= 0 ||
  !Number.isSafeInteger(manifest.runAttempt) ||
  manifest.runAttempt <= 0 ||
  !Array.isArray(manifest.points)
)
  throw new Error('Invalid PowerX publication manifest');
const origin = process.argv[3] ?? 'https://inferencex.semianalysis.com';
const sql = createAdminSql();
try {
  const rows = await sql`
    select c.*, br.id, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint, br.image, br.metrics, br.workers,
      to_jsonb(br) -> 'power_invalid_reasons' as power_invalid_reasons,
      to_jsonb(br) -> 'power_audit' as power_audit,
      wr.html_url || '/attempts/' || wr.run_attempt as run_url
    from benchmark_results br join configs c on c.id = br.config_id
    join workflow_runs wr on wr.id = br.workflow_run_id
    where wr.github_run_id = ${manifest.runId} and wr.run_attempt = ${manifest.runAttempt}
      and br.benchmark_type = 'single_turn' and br.isl = 8192 and br.osl = 1024
  `;
  const errors = [
    ...(manifest.ingestErrors ?? []),
    ...verifyPowerPublication(manifest.points, rows as unknown as PublishedPowerRow[], 'database'),
  ];
  const publicRows: PublishedPowerRow[] = [];
  const models = [
    ...new Set(manifest.points.map((point) => DB_MODEL_TO_DISPLAY[String(point.identity.model)])),
  ];
  for (const model of models) {
    if (!model) throw new Error('Manifest contains an unmapped public model');
    const url = new URL('/api/v1/benchmarks', origin);
    url.search = new URLSearchParams({
      model,
      runId: String(manifest.runId),
      exactRun: 'true',
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
      throw new Error(`Public PowerX verification returned HTTP ${response.status}: ${url}`);
    const body: unknown = await response.json();
    if (
      !Array.isArray(body) ||
      body.some(
        (row) => !row || typeof row !== 'object' || !row.metrics || typeof row.metrics !== 'object',
      )
    )
      throw new Error(`Invalid benchmark response: ${url}`);
    publicRows.push(...body);
  }
  errors.push(...verifyPowerPublication(manifest.points, publicRows, 'public API'));
  const counts = { strict: 0, invalid: 0, other: 0 };
  for (const point of manifest.points) {
    if (point.metrics.power_valid === 1 && point.metrics.power_metric_schema_version === 2)
      counts.strict++;
    else if (point.metrics.power_valid === 0) counts.invalid++;
    else counts.other++;
  }
  const receipt = {
    runId: manifest.runId,
    runAttempt: manifest.runAttempt,
    checkedAt: new Date().toISOString(),
    points: manifest.points.length,
    counts,
    status:
      errors.length > 0 ? 'failed' : manifest.points.length > 0 ? 'matched' : 'no_8k1k_points',
    errors,
  };
  fs.writeFileSync(`${manifestPath}.verification.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await sql.end();
}
