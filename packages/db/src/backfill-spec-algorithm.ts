import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { runBackfillMain, runCandidateIdBackfill } from './lib/backfill-runner.js';
import {
  backfillSpecAlgorithm,
  loadSpecAlgorithmCandidates,
} from './lib/spec-algorithm-backfill.js';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 2, onnotice: () => {} });

async function main(): Promise<void> {
  console.log('=== backfill-spec-algorithm ===');
  await runCandidateIdBackfill(
    () => loadSpecAlgorithmCandidates(sql),
    async (id) => {
      const speculation = await backfillSpecAlgorithm(sql, id);
      if (!speculation) {
        console.log(`  id=${id}: no speculative config in the server log`);
        return 'skipped';
      }
      console.log(`  id=${id}: ${speculation.spec_algorithm} (${speculation.spec_draft_model})`);
      return 'ok';
    },
  );
}

runBackfillMain('backfill-spec-algorithm', sql, main);
