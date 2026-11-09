/** Add display metadata only to the reviewed child campaign; preserve source record hashes. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createAdminSql } from './etl/db-utils.js';
import { assertChildTarget, type TargetReceipt } from './experiments/import.js';

const target = JSON.parse(
  await readFile(new URL('../experiments/child-target.json', import.meta.url), 'utf8'),
) as TargetReceipt;
const url = process.env.EXPERIMENT_DATABASE_WRITE_URL;
assert.ok(url, 'EXPERIMENT_DATABASE_WRITE_URL required; no production fallback');
assertChildTarget(url, target);
assert.ok(process.argv.includes('--apply'), 'Explicit --apply required');
const slug = 'weka-amg-kimi-k3-latest-3h';
const manifestHash = '76886fcbf4db2235129f7ebb131f719a1a7714b24f5e5ab893e52e3396091f8d';
const changelog =
  'Manual import: 3-hour AgentX, 1,200s trace-idle cap. Performance changelog pending.';
const sql = createAdminSql({ url, max: 1 });
try {
  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${slug},0))`;
    const [campaign] = await tx`select * from experiment_campaigns where slug=${slug} for update`;
    assert.equal(campaign.manifest_sha256, manifestHash);
    assert.equal(campaign.complete, true);
    await tx`alter table experiment_runs add column if not exists config_name text`;
    await tx`alter table experiment_runs add column if not exists perf_changelog text`;
    const before =
      await tx`select run_id,series,concurrency,configuration,record_sha256 from experiment_runs where campaign_slug=${slug} order by run_id for update`;
    assert.equal(before.length, 22);
    const metadata = [];
    for (const run of before) {
      const variant = run.configuration.configuration_variant as string;
      assert.ok(variant && /^[a-z0-9-]+$/.test(variant));
      const backend = run.series === 'weka' ? 'weka-amg-e558388-kda-fp8' : `mooncake-${variant}`;
      const configName = `b300-kimi-k3-vllm-${backend}-3h-idle1200-c${run.concurrency}`;
      await tx`update experiment_runs set config_name=${configName},perf_changelog=${changelog} where campaign_slug=${slug} and run_id=${run.run_id}`;
      metadata.push({ run_id: run.run_id, config_name: configName, perf_changelog: changelog });
    }
    const after =
      await tx`select run_id,record_sha256,config_name,perf_changelog from experiment_runs where campaign_slug=${slug} order by run_id`;
    assert.equal(new Set(after.map((r) => r.config_name)).size, 22);
    assert.deepEqual(
      after.map((r) => [r.run_id, r.record_sha256]),
      before.map((r) => [r.run_id, r.record_sha256]),
    );
    return metadata;
  });
  const receipt = {
    campaign: slug,
    target,
    completed_at: new Date().toISOString(),
    source_record_hashes_unchanged: true,
    runs: result,
  };
  await writeFile(
    new URL('../experiments/latest-metadata-receipt.json', import.meta.url),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      campaign: slug,
      annotated_runs: result.length,
      source_record_hashes_unchanged: true,
    }),
  );
} finally {
  await sql.end();
}
