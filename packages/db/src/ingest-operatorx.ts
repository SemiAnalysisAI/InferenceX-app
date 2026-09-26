/**
 * Ingest OperatorX runs into the OperatorX database.
 *
 * Stores each run's RAW documents (the manifest and every shard's operatorx results
 * JSON); the normalizer in src/operatorx/normalize.ts is the single transform point and
 * runs at API-read time. It also runs once here, so a run that cannot be read is never
 * stored. Re-ingesting a run replaces it.
 *
 * Sweep runs are accepted from any branch of the source repo; only the workflow
 * identity is checked.
 *
 * Three modes:
 *   --download <run-url-or-id> [repo]  Download a sweep run's artifacts from GitHub
 *   --bundle <file.json> [...]         Store raw bundles (`OperatorXRawBundle`) as they are
 *   (no flag)                          Read pre-downloaded artifacts from INGEST_ARTIFACTS_PATH
 *
 * Environment variables:
 *   DATABASE_OPERATORX_WRITE_URL — Postgres connection string (direct, non-pooled)
 *   GITHUB_TOKEN                 — GitHub token for run metadata + artifact download
 *   INGEST_RUN_ID                — (env mode) Workflow run ID
 *   INGEST_ARTIFACTS_PATH        — (env mode) Local path to pre-downloaded artifacts
 *   INGEST_REPO                  — (env mode) Source repo slug (owner/name)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { hasNoSslFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { downloadArtifact, fetchRunMeta, listRunArtifacts } from './lib/github-artifacts';
import type { OperatorXRawBundle } from './operatorx/bundle';
import { saveOperatorXBundle } from './queries/operatorx';

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
const SWEEP_WORKFLOW_PATH = '.github/workflows/operatorx-sweep.yml';
const MANIFEST_FILE = 'operatorx-manifest.json';
const SHARD_RE = /^operatorx-shard-(?<run>\d+)-(?<attempt>\d+)-(?<shard>.+)$/u;

/** Every results JSON under an artifact's results/, except counter dumps. */
function readResultDocs(dir: string): unknown[] {
  const root = path.join(dir, 'results');
  if (!fs.existsSync(root)) return [];
  const docs: unknown[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (full !== path.join(root, 'counters')) walk(full);
      } else if (entry.name.endsWith('.json')) {
        docs.push(JSON.parse(fs.readFileSync(full, 'utf8')));
      }
    }
  };
  walk(root);
  return docs;
}

/** The newest artifact name per shard, from attempts up to `attempt`. */
function selectShards(names: string[], runId: string, attempt: number) {
  const shards = new Map<string, { name: string; attempt: number }>();
  for (const name of names) {
    const m = SHARD_RE.exec(name);
    if (!m || m.groups!.run !== runId || Number(m.groups!.attempt) > attempt) continue;
    const prior = shards.get(m.groups!.shard);
    if (!prior || Number(m.groups!.attempt) > prior.attempt)
      shards.set(m.groups!.shard, { name, attempt: Number(m.groups!.attempt) });
  }
  return shards;
}

/** A sweep run's bundle from its artifacts in `dir`, downloading them first if asked. */
function sweepBundle(repo: string, runId: string, dir: string, download: boolean) {
  const run = fetchRunMeta(repo, runId);
  if (run.path !== SWEEP_WORKFLOW_PATH)
    throw new Error(`run ${runId} is not an OperatorX sweep (workflow: ${run.path})`);
  if (run.status !== 'completed') throw new Error(`run ${runId} is still in progress`);
  console.log(
    `  branch: ${run.head_branch ?? '?'}  attempt: ${run.run_attempt}  conclusion: ${run.conclusion}`,
  );
  const manifestName = `operatorx-manifest-${runId}`;
  if (download) {
    const artifacts = listRunArtifacts(repo, runId).filter((a) => !a.expired);
    const newest = new Map<string, (typeof artifacts)[number]>();
    for (const a of artifacts) {
      const prior = newest.get(a.name);
      if (!prior || a.created_at > prior.created_at) newest.set(a.name, a);
    }
    const wanted = [
      manifestName,
      ...[...selectShards([...newest.keys()], runId, run.run_attempt).values()].map((s) => s.name),
    ];
    for (const name of wanted) {
      const artifact = newest.get(name);
      if (!artifact) continue;
      console.log(`  downloading ${name}`);
      downloadArtifact(artifact, dir);
    }
  }
  const manifestPath = path.join(dir, manifestName, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) throw new Error(`run ${runId} has no ${manifestName} artifact`);
  const available = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const bundle: OperatorXRawBundle = {
    run: {
      run_id: runId,
      run_attempt: run.run_attempt,
      source_sha: run.head_sha,
      source_branch: run.head_branch,
      generated_at: run.created_at ?? run.run_started_at ?? '',
      conclusion: run.conclusion,
    },
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    shards: [],
  };
  for (const [id, { name, attempt }] of selectShards(available, runId, run.run_attempt))
    bundle.shards.push({ id, attempt, docs: readResultDocs(path.join(dir, name)) });
  return bundle;
}

function parseRunId(input: string | undefined): string {
  const m = input?.match(/\/runs\/(?<runId>\d+)/u);
  const id = m ? m.groups!.runId : input && /^\d+$/u.test(input) ? input : null;
  if (!id) throw new Error(`Could not parse run ID from: ${input ?? '(none)'}`);
  return id;
}

function checkRepo(repo: string): string {
  // reaches shell-interpolated `gh api` calls
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo)) throw new Error(`Invalid repo slug: ${repo}`);
  return repo;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const args = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  const bundles: OperatorXRawBundle[] = [];
  let tempDir: string | null = null;
  try {
    if (mode === '--bundle') {
      if (args.length === 0) throw new Error('Usage: ingest-operatorx.ts --bundle <file.json> ...');
      for (const file of args) bundles.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    } else if (mode === '--download') {
      const runId = parseRunId(args[0]);
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-ingest-'));
      console.log(`=== run ${runId} ===`);
      bundles.push(sweepBundle(checkRepo(args[1] ?? DEFAULT_REPO), runId, tempDir, true));
    } else {
      const dir = process.env.INGEST_ARTIFACTS_PATH;
      if (!process.env.INGEST_RUN_ID || !dir)
        throw new Error('INGEST_RUN_ID and INGEST_ARTIFACTS_PATH are required without a flag');
      const runId = parseRunId(process.env.INGEST_RUN_ID);
      console.log(`=== run ${runId} ===`);
      bundles.push(
        sweepBundle(checkRepo(process.env.INGEST_REPO ?? DEFAULT_REPO), runId, dir, false),
      );
    }

    const sql = createAdminSql({
      envVar: 'DATABASE_OPERATORX_WRITE_URL',
      noSsl: hasNoSslFlag(),
      max: 1,
      onnotice: () => {},
    });
    try {
      for (const bundle of bundles) {
        const { docs, results } = await saveOperatorXBundle(sql, bundle);
        console.log(
          `  stored run ${bundle.run.run_id}: ${bundle.shards.length} shards, ${docs} docs, ${results} results`,
        );
      }
    } finally {
      await sql.end();
    }
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('db:ingest:operatorx failed:', error);
  process.exitCode = 1;
});
