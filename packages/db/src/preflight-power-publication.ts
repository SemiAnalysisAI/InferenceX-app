import { verifyRequiredPowerArtifacts } from './etl/required-power-publication';

// Deliberately artifact-only: this entry point opens no DB connection and writes no files.
const [root, runId, runAttempt, headSha, option] = process.argv.slice(2);
if (
  !root ||
  !runId ||
  !runAttempt ||
  !/^\d+$/u.test(runId) ||
  !/^\d+$/u.test(runAttempt) ||
  !Number.isSafeInteger(Number(runId)) ||
  !Number.isSafeInteger(Number(runAttempt)) ||
  Number(runId) <= 0 ||
  Number(runAttempt) <= 0 ||
  !headSha ||
  !/^[a-f0-9]{40}$/u.test(headSha) ||
  (option !== undefined && option !== '--optional-power') ||
  process.argv.length > 7
)
  throw new Error(
    'Usage: preflight-power-publication.ts <artifacts-dir> <source-run-id> <attempt> <head-sha> [--optional-power]',
  );

const points = verifyRequiredPowerArtifacts(
  root,
  { runId: Number(runId), runAttempt: Number(runAttempt), headSha },
  option !== '--optional-power',
);
console.log(
  JSON.stringify({
    status: 'validated_artifacts',
    requiredPoints: points.length,
    databaseWrites: 0,
    curvePreservation: 'not_checked_requires_published_state',
  }),
);
