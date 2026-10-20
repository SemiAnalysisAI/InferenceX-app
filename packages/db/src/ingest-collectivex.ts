import fs from 'fs';
import os from 'os';
import path from 'path';

import { GITHUB_REPO_FULL } from '@semianalysisai/inferencex-constants';

import { hasNoSslFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import {
  downloadArtifact,
  fetchRunMeta,
  listRunArtifacts,
  type RunMeta,
} from './lib/github-artifacts';
import { repositoryFromRunUrl } from './lib/runtime-metadata-artifacts';
import { matrixArtifactName, selectShardArtifactNames } from './collectivex/artifact-selection';
import {
  buildDatasetFromNeutral,
  buildRunSummary,
  isMatrixDoc,
  matrixVersion,
  type CollectiveXNeutralRunMeta,
} from './collectivex/reader';

const DEFAULT_REPO = process.env.INGEST_REPO || GITHUB_REPO_FULL;
const SWEEP_WORKFLOW_PATH = '.github/workflows/collectivex-sweep.yml';
const DOCS_INSERT_CHUNK = 200;

const isDownloadMode = process.argv[2] === '--download';

let artifactsDir: string;
let runIdStr: string;
let REPO: string;
let tempDir: string | null = null;

if (isDownloadMode) {
  const args = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  const input = args[0];
  if (!input) {
    console.error('Usage: bun run admin:db:ingest:collectivex <run-url-or-id> [repo]');
    process.exit(1);
  }
  const match = input.match(/\/runs\/(?<runId>\d+)/u);
  const parsedId = match ? match.groups!.runId : /^\d+$/u.test(input) ? input : null;
  if (!parsedId) {
    console.error(`Could not parse run ID from: ${input}`);
    process.exit(1);
  }
  runIdStr = parsedId;
  REPO = args[1] ?? repositoryFromRunUrl(input) ?? DEFAULT_REPO;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-ingest-'));
  artifactsDir = tempDir;
} else {
  const runId = process.env.INGEST_RUN_ID;
  const artifactsPath = process.env.INGEST_ARTIFACTS_PATH;
  if (!runId || !artifactsPath) {
    console.error('INGEST_RUN_ID and INGEST_ARTIFACTS_PATH are required without --download');
    process.exit(1);
  }
  runIdStr = runId;
  REPO = DEFAULT_REPO;
  artifactsDir = artifactsPath;
}

if (!/^[\w.-]+\/[\w.-]+$/u.test(REPO)) {
  console.error(`Invalid repo slug: ${REPO}`);
  process.exit(1);
}
if (!/^\d+$/u.test(runIdStr)) {
  console.error(`Invalid run id: ${runIdStr}`);
  process.exit(1);
}

function readDocsDir(dir: string): unknown[] {
  const docs: unknown[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      docs.push(...readDocsDir(full));
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    docs.push(JSON.parse(fs.readFileSync(full, 'utf8')));
  }
  return docs;
}

function runGeneratedAt(run: RunMeta): string {
  return run.updated_at || run.run_started_at || run.created_at || '';
}

async function main(): Promise<void> {
  console.log(`=== db:ingest:collectivex — run ${runIdStr} (${REPO}) ===`);

  const run = fetchRunMeta(REPO, runIdStr);
  if (run.path !== SWEEP_WORKFLOW_PATH) {
    throw new Error(`run ${runIdStr} is not a CollectiveX sweep (workflow: ${run.path})`);
  }
  const generatedAt = runGeneratedAt(run);
  if (!generatedAt) throw new Error(`run ${runIdStr} is missing a timestamp`);
  console.log(
    `  workflow: ${run.name}  branch: ${run.head_branch ?? '?'}  attempt: ${run.run_attempt}  conclusion: ${run.conclusion ?? 'in-progress'}`,
  );

  const matrixDirName = matrixArtifactName(runIdStr);

  if (isDownloadMode) {
    const artifacts = listRunArtifacts(REPO, runIdStr);
    const byName = new Map<string, (typeof artifacts)[number]>();
    for (const artifact of artifacts) {
      const existing = byName.get(artifact.name);
      if (!existing || artifact.created_at > existing.created_at) {
        byName.set(artifact.name, artifact);
      }
    }
    const wanted = [
      matrixDirName,
      ...selectShardArtifactNames([...byName.keys()], runIdStr, run.run_attempt),
    ];
    for (const name of wanted) {
      const artifact = byName.get(name);
      if (!artifact) continue;
      console.log(`  downloading ${name}`);
      downloadArtifact(artifact, artifactsDir);
    }
  }

  const availableDirs = fs
    .readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (!availableDirs.includes(matrixDirName)) {
    throw new Error(`run ${runIdStr} has no ${matrixDirName} artifact`);
  }
  const matrixDocs = readDocsDir(path.join(artifactsDir, matrixDirName)).filter((doc) =>
    isMatrixDoc(doc),
  );
  if (matrixDocs.length !== 1) {
    throw new Error(`expected exactly one matrix document, found ${matrixDocs.length}`);
  }
  const matrix = matrixDocs[0];
  const version = matrixVersion(matrix);
  if (version === null) throw new Error('matrix document has no valid version tag');

  const shardDirs = selectShardArtifactNames(availableDirs, runIdStr, run.run_attempt);
  console.log(`  matrix version: ${version}  shard artifacts: ${shardDirs.length}`);
  const docs = shardDirs.flatMap((dir) => readDocsDir(path.join(artifactsDir, dir)));

  const meta: CollectiveXNeutralRunMeta = {
    run_id: runIdStr,
    run_attempt: run.run_attempt,
    generated_at: generatedAt,
    conclusion: run.conclusion,
    source_sha: run.head_sha,
    ...(REPO.toLowerCase() === GITHUB_REPO_FULL.toLowerCase() ? {} : { source_repository: REPO }),
  };
  const dataset = buildDatasetFromNeutral(matrix, docs, meta);
  const summary = buildRunSummary(dataset);
  console.log(
    `  assembled: ${summary.requested_cases} cases (${summary.measured_cases} measured), ${summary.requested_points} points`,
  );

  const sql = createAdminSql({
    envVar: 'DATABASE_COLLECTIVEX_WRITE_URL',
    noSsl: hasNoSslFlag(),
    max: 1,
    onnotice: () => {},
  });
  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM cx_runs WHERE run_id = ${runIdStr}`;
      await tx`
        INSERT INTO cx_runs
          (run_id, run_attempt, version, generated_at, source_sha, source_branch, conclusion, matrix, summary)
        VALUES
          (${runIdStr}, ${run.run_attempt}, ${version}, ${generatedAt}, ${run.head_sha},
           ${run.head_branch}, ${run.conclusion}, ${matrix as never}::jsonb,
           ${summary as never}::jsonb)
      `;
      for (let i = 0; i < docs.length; i += DOCS_INSERT_CHUNK) {
        const chunk = docs.slice(i, i + DOCS_INSERT_CHUNK).map((doc) => JSON.stringify(doc));
        await tx`
          INSERT INTO cx_run_docs (run_id, run_attempt, doc)
          SELECT ${runIdStr}, ${run.run_attempt}, unnest(${tx.array(chunk)}::jsonb[])
        `;
      }
    });
    console.log(`  stored run ${runIdStr} (version ${version}, ${docs.length} docs)`);
  } finally {
    await sql.end();
  }

  console.log('=== db:ingest:collectivex complete ===');
}

main()
  .catch((error) => {
    console.error('db:ingest:collectivex failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });
