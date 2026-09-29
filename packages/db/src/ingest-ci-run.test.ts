import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('explicit download attempt identity', () => {
  it('rejects a download whose GitHub attempt differs from the requested one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-ingest-'));
    const manifestPath = path.join(dir, 'power-publication.json');
    try {
      fs.writeFileSync(
        path.join(dir, 'gh'),
        '#!/bin/sh\ncase "$*" in\n*--paginate*) exit 0 ;;\n*--jq*) printf "2\\n" ;;\n*) exit 3 ;;\nesac\n',
        { mode: 0o755 },
      );
      const result = spawnSync(
        'bun',
        [
          fileURLToPath(new URL('ingest-ci-run.ts', import.meta.url)),
          '--download',
          'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/25199291771/attempts/1',
        ],
        {
          cwd: dir,
          env: {
            PATH: `${dir}${path.delimiter}${process.env.PATH}`,
            TMPDIR: dir,
            NODE_ENV: 'test',
            DATABASE_WRITE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
            GITHUB_TOKEN: 'unused',
            POWER_PUBLICATION_MANIFEST: manifestPath,
          },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain('GitHub attempt 2 differs from requested 1');
      expect(fs.existsSync(manifestPath)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('purged CI ingestion', () => {
  it.each([
    { runId: 20286769842, runAttempt: 1, reused: false },
    { runId: 25199291771, runAttempt: 2, reused: false },
    { runId: 25199291771, runAttempt: 2, reused: true },
  ])(
    'writes an empty publication manifest for $runId/$runAttempt (reused=$reused)',
    ({ runId, runAttempt, reused }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purged-ingest-'));
      const manifestPath = path.join(dir, 'power-publication.json');
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
          telemetryWarnings: [],
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
