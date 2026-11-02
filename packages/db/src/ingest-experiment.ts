/** Explicit, immutable import into the approved child DB; never uses DATABASE_WRITE_URL. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminSql } from './etl/db-utils.js';
import {
  assertChildTarget,
  insertPreparedRun,
  prepareRun,
  sha,
  validateManifest,
  type InputManifest,
  type PreparedRun,
  type TargetReceipt,
} from './experiments/import.js';

const args = process.argv.slice(2);
function flag(name: string): string {
  const i = args.indexOf(name);
  assert.ok(i !== -1 && args[i + 1], `Required ${name}`);
  return args[i + 1];
}
async function main() {
  const manifestPath = flag('--manifest'),
    preparedRoot = flag('--prepared-dir');
  const raw = await readFile(manifestPath);
  const manifest = JSON.parse(raw.toString()) as InputManifest;
  validateManifest(manifest);
  const manifestHash = sha(raw);
  await mkdir(preparedRoot, { recursive: true });
  if (args.includes('--prepare-only')) {
    const root = flag('--source-root');
    for (const r of manifest.runs) {
      const dir = path.join(preparedRoot, r.run_id);
      let prior: { manifest_sha256: string } | null = null;
      try {
        prior = JSON.parse(await readFile(path.join(dir, 'prepared-receipt.json'), 'utf8'));
      } catch {}
      if (prior) {
        assert.equal(prior.manifest_sha256, manifestHash, 'Prepared input manifest changed');
        console.log(`Prepared already: ${r.run_id}`);
        continue;
      }
      console.log(`Preparing ${r.run_id}`);
      const result = await prepareRun(r, root, dir);
      await writeFile(
        path.join(dir, 'prepared-receipt.json'),
        `${JSON.stringify({
          manifest_sha256: manifestHash,
          record_sha256: result.record_sha256,
        })}\n`,
      );
      console.log(
        `Prepared ${r.run_id}: ${result.payload_inventory.map((p) => `${p.kind}=${p.compressed_bytes}`).join(', ')}`,
      );
    }
    await writeFile(
      path.join(preparedRoot, 'manifest-receipt.json'),
      `${JSON.stringify({ manifest_sha256: manifestHash, runs: manifest.runs.length })}\n`,
    );
    return;
  }
  assert.ok(args.includes('--apply'), 'Use --prepare-only or explicit --apply');
  const receipt = JSON.parse(await readFile(flag('--target-receipt'), 'utf8')) as TargetReceipt;
  const url = process.env.EXPERIMENT_DATABASE_WRITE_URL;
  assert.ok(url, 'EXPERIMENT_DATABASE_WRITE_URL required; no production fallback');
  assertChildTarget(url, receipt);
  const preparedReceipt = JSON.parse(
    await readFile(path.join(preparedRoot, 'manifest-receipt.json'), 'utf8'),
  );
  assert.equal(preparedReceipt.manifest_sha256, manifestHash);
  const sql = createAdminSql({ url, max: 1, connect_timeout: 30, idle_timeout: 30 });
  try {
    const [{ db }] = await sql`select current_database() as db`;
    assert.equal(db, receipt.database);
    // Only the isolated additive experiment schema, never the normal migration runner.
    await sql.unsafe(
      await readFile(fileURLToPath(new URL('../experiments/schema.sql', import.meta.url)), 'utf8'),
    );
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${manifest.slug},0))`;
      const prior =
        await tx`select manifest_sha256 from experiment_campaigns where slug=${manifest.slug}`;
      if (prior.length > 0)
        assert.equal(
          prior[0].manifest_sha256,
          manifestHash,
          'Campaign manifest differs; refusing overwrite',
        );
      else
        await tx`insert into experiment_campaigns(slug,title,description,reference_points,comparison_notes,manifest_sha256,expected_run_count) values (${manifest.slug},${manifest.title},${manifest.description},${tx.json(manifest.reference_points as never)},${tx.json(manifest.comparison_notes as never)},${manifestHash},${manifest.runs.length})`;
    });
    const results = [];
    for (const r of manifest.runs) {
      const dir = path.join(preparedRoot, r.run_id);
      const p = JSON.parse(await readFile(path.join(dir, 'run.json'), 'utf8')) as PreparedRun;
      assert.equal(p.row.run_id, r.run_id);
      const result = await insertPreparedRun(sql, manifest.slug, p, dir);
      results.push({ run_id: r.run_id, status: result });
      console.log(`${r.run_id}: ${result}`);
    }
    const stored =
      await sql`select run_id,record_sha256,clean_backend_qualified,frontier_eligible from experiment_runs where campaign_slug=${manifest.slug}`;
    assert.deepEqual(stored.map((r) => r.run_id).sort(), manifest.runs.map((r) => r.run_id).sort());
    assert.equal(stored.filter((r) => !r.frontier_eligible).length, 1);
    const chunks =
      await sql`select run_id,kind,count(*)::int as parts,sum(octet_length(data))::bigint as bytes, encode(sha256(string_agg(data,''::bytea order by part)),'hex') as payload_sha256 from experiment_payload_chunks where campaign_slug=${manifest.slug} group by run_id,kind`;
    for (const r of manifest.runs) {
      const p = JSON.parse(
        await readFile(path.join(preparedRoot, r.run_id, 'run.json'), 'utf8'),
      ) as PreparedRun;
      assert.equal(stored.find((x) => x.run_id === r.run_id)?.record_sha256, p.record_sha256);
      for (const payload of p.payload_inventory) {
        const c = chunks.find((chunk) => chunk.run_id === r.run_id && chunk.kind === payload.kind);
        assert.ok(c);
        assert.equal(Number(c.parts), payload.parts);
        assert.equal(Number(c.bytes), payload.compressed_bytes);
        assert.equal(c.payload_sha256, payload.sha256);
      }
    }
    await sql`update experiment_campaigns set complete=true where slug=${manifest.slug} and manifest_sha256=${manifestHash}`;
    await writeFile(
      path.join(preparedRoot, 'import-receipt.json'),
      `${JSON.stringify(
        {
          campaign: manifest.slug,
          manifest_sha256: manifestHash,
          target: receipt,
          completed_at: new Date().toISOString(),
          runs: results,
          stored_count: stored.length,
          payloads: chunks,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await sql.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
