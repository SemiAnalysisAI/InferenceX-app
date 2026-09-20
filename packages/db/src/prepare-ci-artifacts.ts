#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { buildArtifactPlan } from './lib/ci-artifact-preparation.js';
import { downloadArtifact, listRunArtifacts, type ArtifactMeta } from './lib/github-artifacts.js';

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';

interface GithubRunMetadata {
  head_sha?: string;
  html_url?: string;
  pull_requests?: { number?: number }[];
  run_attempt?: number;
}

function requiredRunId(value: string | undefined, label: string): string {
  if (!value || !/^\d+$/u.test(value)) {
    throw new Error(`${label} must be a numeric GitHub Actions run ID`);
  }
  return value;
}

function fetchRunMetadata(repo: string, runId: string): GithubRunMetadata {
  return JSON.parse(
    execFileSync('gh', ['api', `repos/${repo}/actions/runs/${runId}`], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }),
  ) as GithubRunMetadata;
}

function downloadWithRetries(artifact: ArtifactMeta, artifactsPath: string, attempt = 1): void {
  const zipPath = path.join(artifactsPath, 'artifact.zip');
  const artifactPath = path.join(artifactsPath, artifact.name);
  try {
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(artifactPath, { recursive: true, force: true });
    downloadArtifact(artifact, artifactsPath);
  } catch (error) {
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(artifactPath, { recursive: true, force: true });
    if (attempt >= 3) {
      throw new Error(`Failed to download artifact ${artifact.name} after 3 attempts`, {
        cause: error,
      });
    }
    console.warn(`  attempt ${attempt}/3 failed; retrying in ${attempt}s`);
    execFileSync('sleep', [String(attempt)]);
    downloadWithRetries(artifact, artifactsPath, attempt + 1);
  }
}

function writeOutputs(values: Record<string, string | number | boolean>): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  fs.appendFileSync(
    outputPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('\n')}\n`,
  );
}

function writeReuseMetadata(
  artifactsPath: string,
  sourceRunId: string,
  mergeRunId: string,
  source: GithubRunMetadata,
  merge: GithubRunMetadata,
): void {
  const metadataDir = path.join(artifactsPath, 'reused-ingest-metadata');
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(
    path.join(metadataDir, 'reuse_source_run.json'),
    `${JSON.stringify(
      {
        source_run_id: sourceRunId,
        source_run_attempt: source.run_attempt ?? 1,
        source_run_url:
          source.html_url ??
          `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${sourceRunId}`,
        source_pr_number: source.pull_requests?.[0]?.number ?? null,
        source_head_sha: source.head_sha ?? null,
        ingest_run_id: mergeRunId,
        ingest_run_attempt: merge.run_attempt ?? 1,
        ingest_run_url:
          merge.html_url ??
          `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${mergeRunId}`,
      },
      null,
      2,
    )}\n`,
  );
}

function main(): void {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((arg) => arg !== '--dry-run');
  const sourceRunId = requiredRunId(process.env.SOURCE_RUN_ID ?? positional[0], 'SOURCE_RUN_ID');
  const mergeRunId = requiredRunId(
    process.env.MERGE_RUN_ID ?? positional[1] ?? sourceRunId,
    'MERGE_RUN_ID',
  );
  const repo = process.env.INGEST_REPO ?? DEFAULT_REPO;
  const artifactsPath = process.env.ARTIFACTS_PATH ?? path.resolve('artifacts');

  const sourceMetadata = fetchRunMetadata(repo, sourceRunId);
  const mergeMetadata =
    mergeRunId === sourceRunId ? sourceMetadata : fetchRunMetadata(repo, mergeRunId);
  const sourceArtifacts = listRunArtifacts(repo, sourceRunId);
  const mergeArtifacts =
    mergeRunId === sourceRunId ? sourceArtifacts : listRunArtifacts(repo, mergeRunId);
  const plan = buildArtifactPlan(sourceRunId, mergeRunId, sourceArtifacts, mergeArtifacts);

  console.log(`Source run: ${sourceRunId} (attempt ${sourceMetadata.run_attempt ?? 1})`);
  console.log(`Merge run:  ${mergeRunId} (attempt ${mergeMetadata.run_attempt ?? 1})`);
  console.log(
    `Selected ${plan.artifacts.length} of ${sourceArtifacts.length} source-run artifact upload(s)${
      plan.reused ? ' plus the merge-run changelog' : ''
    }:`,
  );
  for (const artifact of plan.artifacts) {
    console.log(`  ${artifact.created_at}  ${artifact.id ?? '-'}  ${artifact.name}`);
  }

  writeOutputs({
    'source-run-id': sourceRunId,
    'source-run-attempt': sourceMetadata.run_attempt ?? 1,
    'merge-run-id': mergeRunId,
    'merge-run-attempt': mergeMetadata.run_attempt ?? 1,
    reused: plan.reused,
  });

  if (dryRun) {
    console.log('Dry run complete; no artifacts were downloaded.');
    return;
  }

  fs.mkdirSync(artifactsPath, { recursive: true });
  if (fs.readdirSync(artifactsPath).length > 0) {
    throw new Error(`ARTIFACTS_PATH must be empty before preparation: ${artifactsPath}`);
  }
  for (const artifact of plan.artifacts) {
    console.log(`Downloading artifact: ${artifact.name}`);
    downloadWithRetries(artifact, artifactsPath);
  }
  if (plan.reused) {
    writeReuseMetadata(artifactsPath, sourceRunId, mergeRunId, sourceMetadata, mergeMetadata);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
