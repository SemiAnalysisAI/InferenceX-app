import fs from 'node:fs';
import { createAdminSql } from './etl/db-utils';
import { verifyMeasurementSchema } from './lib/measurement-schema';

const target = process.env.MIGRATION_DATABASE_TARGET;
const sourceSha = process.env.GITHUB_SHA;
const output = process.argv[2];
if (
  !output ||
  !['staging', 'production'].includes(target ?? '') ||
  !sourceSha?.match(/^[a-f0-9]{40}$/) ||
  sourceSha !== process.env.MIGRATION_EXPECTED_SHA
) {
  throw new Error(
    'Schema verification requires an output path, explicit target and exact workflow commit',
  );
}

const sql = createAdminSql({ max: 1 });
try {
  const schema = await sql.begin('read only', (tx) => verifyMeasurementSchema(tx));
  const report = {
    schema_version: 1,
    status: 'verified',
    database_target: target,
    app_sha: sourceSha,
    workflow_run_id: process.env.GITHUB_RUN_ID,
    workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    verified_at: new Date().toISOString(),
    schema,
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Verified receipt schema on ${target}; evidence: ${output}`);
} finally {
  await sql.end();
}
