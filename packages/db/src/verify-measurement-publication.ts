/** Read-only, receipt-driven check of exact-run and latest visibility plus raw/sample details. */
import fs from 'node:fs';
import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';
import { receiptFromEnvironment } from './lib/measurement-receipt';
import {
  expectedPublication,
  publishedPointMatches,
  verifyPublishedMeasurements,
  type PublishedMeasurement,
} from './etl/measurement-publication';

const receipt = receiptFromEnvironment();
if (!receipt) throw new Error('An immutable measurement receipt is required');
const root = process.env.INGEST_ARTIFACTS_PATH;
const origin = process.argv[2];
const output = process.argv[3];
if (!root || !origin || !output)
  throw new Error(
    'Usage: verify-measurement-publication.ts <public-origin> <verification.json>; INGEST_ARTIFACTS_PATH and receipt environment are required',
  );
const expected = expectedPublication(receipt, root);
async function readApi(route: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(route, origin);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: process.env.CACHE_PROTECTION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.CACHE_PROTECTION_BYPASS_SECRET }
      : undefined,
  });
  if (!response.ok) throw new Error(`Publication request failed: ${url} HTTP ${response.status}`);
  return response.json();
}
const errors: string[] = [];
const benchmarks: PublishedMeasurement[] = [];
const latest: PublishedMeasurement[] = [];
for (const modelKey of new Set(receipt.points.map((point) => point.config.model))) {
  const model = DB_MODEL_TO_DISPLAY[modelKey];
  if (!model) throw new Error(`Unmapped public model: ${modelKey}`);
  benchmarks.push(
    ...(await readApi('/api/v1/benchmarks', {
      model,
      runId: receipt.source_run_id,
      exactRun: 'true',
    })),
  );
  latest.push(...(await readApi('/api/v1/benchmarks', { model })));
}
errors.push(
  ...verifyPublishedMeasurements(expected, benchmarks, 'throughput', 'exact run'),
  ...verifyPublishedMeasurements(expected, latest, 'throughput', 'latest curve'),
);
const evals = ((await readApi('/api/v1/evaluations')) as PublishedMeasurement[]).filter(
  (row) =>
    row.run_url ===
    `https://github.com/${receipt.repository}/actions/runs/${receipt.source_run_id}`,
);
errors.push(...verifyPublishedMeasurements(expected, evals, 'eval', 'evaluation API'));
for (const item of expected) {
  const rows = (item.point.kind === 'throughput' ? benchmarks : evals).filter((row) =>
    publishedPointMatches(item.point, row),
  );
  if (rows.length !== 1) continue;
  if (item.point.kind === 'throughput') {
    const availability = await readApi('/api/v1/trace-availability', { ids: String(rows[0].id) });
    if (availability[String(rows[0].id)] !== true)
      errors.push(`${item.point.point_id}: missing raw trace detail`);
  } else {
    const detail = await readApi('/api/v1/eval-samples', {
      eval_result_id: String(rows[0].id),
      filter: 'all',
      limit: '1',
    });
    if (
      detail.total !== item.point.sample_count ||
      detail.passedTotal !== item.strictPassed ||
      detail.failedTotal !== item.point.sample_count - item.strictPassed!
    )
      errors.push(`${item.point.point_id}: strict sample detail coverage differs`);
  }
}
const result = {
  version: 1,
  receipt_id: receipt.receipt_id,
  checked_at: new Date().toISOString(),
  points: expected.length,
  status: errors.length > 0 ? 'failed' : 'matched',
  errors,
};
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
