import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('purged CI ingestion', () => {
  it.each([
    { runId: 20286769842, runAttempt: 1, reused: false },
    { runId: 35855544139, runAttempt: 1, reused: false },
    { runId: 35855544139, runAttempt: 2, reused: true },
    { runId: 25199291771, runAttempt: 2, reused: false },
    { runId: 25199291771, runAttempt: 2, reused: true },
  ])(
    'writes empty publication and write receipts for $runId/$runAttempt (reused=$reused)',
    ({ runId, runAttempt, reused }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purged-ingest-'));
      const manifestPath = path.join(dir, 'power-publication.json');
      const writeReceiptPath = path.join(dir, 'database-writes.json');
      try {
        if (reused) {
          const metadataDir = path.join(dir, 'reused-ingest-metadata');
          fs.mkdirSync(metadataDir);
          fs.writeFileSync(
            path.join(metadataDir, 'reuse_source_run.json'),
            JSON.stringify({ source_run_id: runId, source_run_attempt: runAttempt }),
          );
        }
        const result = spawnSync(
          'bun',
          [fileURLToPath(new URL('ingest-ci-run.ts', import.meta.url))],
          {
            cwd: dir,
            env: {
              PATH: process.env.PATH,
              NODE_ENV: 'test',
              DATABASE_WRITE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
              GITHUB_TOKEN: 'unused',
              INGEST_RUN_ID: String(reused ? 99999999999 : runId),
              INGEST_RUN_ATTEMPT: String(reused ? 1 : runAttempt),
              INGEST_ARTIFACTS_PATH: dir,
              INGEST_REPO: 'SemiAnalysisAI/InferenceX',
              POWER_PUBLICATION_MANIFEST: manifestPath,
              DATABASE_WRITE_RECEIPT: writeReceiptPath,
            },
            encoding: 'utf8',
            timeout: 10_000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('is purged via run-overrides — skipping.');
        expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toEqual({
          version: 1,
          runId,
          runAttempt,
          points: [],
          ingestErrors: [],
          publicationWarnings: [],
          telemetryWarnings: [],
        });
        expect(JSON.parse(fs.readFileSync(writeReceiptPath, 'utf8'))).toEqual({
          version: 1,
          runId,
          runAttempt,
          errors: [],
          warnings: [],
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe('database write receipt on a failed ingest', () => {
  // The finalizer writes this receipt before its telemetry read, which queries
  // the database; nothing after a failed ingest may skip it.
  it('is written when the ingest itself fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failed-ingest-'));
    const writeReceiptPath = path.join(dir, 'database-writes.json');
    try {
      const result = spawnSync(
        'bun',
        [fileURLToPath(new URL('ingest-ci-run.ts', import.meta.url))],
        {
          cwd: dir,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            // Unreachable, so the ingest fails before writing anything.
            DATABASE_WRITE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
            GITHUB_TOKEN: 'unused',
            // Fail GitHub lookups fast and offline.
            HTTPS_PROXY: 'http://127.0.0.1:1',
            HTTP_PROXY: 'http://127.0.0.1:1',
            INGEST_RUN_ID: '99999999998',
            INGEST_RUN_ATTEMPT: '1',
            INGEST_ARTIFACTS_PATH: dir,
            INGEST_REPO: 'SemiAnalysisAI/InferenceX',
            POWER_PUBLICATION_MANIFEST: path.join(dir, 'power-publication.json'),
            DATABASE_WRITE_RECEIPT: writeReceiptPath,
          },
          encoding: 'utf8',
          timeout: 20_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(fs.existsSync(writeReceiptPath), result.stderr).toBe(true);
      expect(JSON.parse(fs.readFileSync(writeReceiptPath, 'utf8'))).toMatchObject({
        version: 1,
        runId: 99999999998,
        runAttempt: 1,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

function ingest(rows: unknown[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentx-cli-'));
  const artifact = path.join(dir, 'bmk_agentic_point');
  fs.mkdirSync(artifact);
  fs.writeFileSync(path.join(artifact, 'agg.json'), JSON.stringify(rows));
  const result = spawnSync(
    'bun',
    [
      '--preload',
      fileURLToPath(new URL('etl/fixtures/ingest-cli-preload.mjs', import.meta.url)),
      fileURLToPath(new URL('ingest-ci-run.ts', import.meta.url)),
    ],
    {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        DATABASE_WRITE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
        GITHUB_TOKEN: 'unused',
        INGEST_RUN_ID: '123',
        INGEST_RUN_ATTEMPT: '1',
        INGEST_ARTIFACTS_PATH: dir,
        INGEST_REPO: 'SemiAnalysisAI/InferenceX',
        POWER_PUBLICATION_MANIFEST: path.join(dir, 'publication.json'),
      },
      encoding: 'utf8',
      timeout: 20_000,
    },
  );
  return { dir, result };
}

describe('AgentX retry ingest command', () => {
  const golden = JSON.parse(
    fs.readFileSync(
      new URL('etl/fixtures/powerx-manifest-v2/bmk_agentic_golden/agg.json', import.meta.url),
      'utf8',
    ),
  );

  it.each([false, true])(
    'preserves a failed attempt warning with winner=%s',
    (withWinner) => {
      const { dir, result } = ingest([
        {
          ...golden,
          benchmark_outcome: { status: 'failed', attempt_id: 'failure', finalized: false },
        },
        ...(withWinner ? [golden] : []),
      ]);
      try {
        expect(result.status, result.stderr).toBe(0);
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'publication.json'), 'utf8'));
        expect(manifest.ingestErrors).toEqual([]);
        expect(manifest.publicationWarnings).toEqual([
          'Known-failed agentic result excluded: bmk_agentic_point/agg.json',
        ]);
        expect(manifest.points).toHaveLength(withWinner ? 1 : 0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
