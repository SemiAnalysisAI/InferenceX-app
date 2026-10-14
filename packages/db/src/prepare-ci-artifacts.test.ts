import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ metadata: vi.fn(), artifacts: vi.fn(), download: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.metadata }));
vi.mock('./lib/github-artifacts.js', () => ({
  listRunArtifacts: mocks.artifacts,
  downloadArtifact: mocks.download,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('required-power preparation', () => {
  it.each([
    { runId: '35855544139', mergeRunId: '35855544139', attempt: 1, purged: true },
    { runId: '35855544139', mergeRunId: '99999999999', attempt: 2, purged: true },
    { runId: '99999999999', mergeRunId: '99999999999', attempt: 1, purged: false },
  ])(
    'respects source purge state for $runId/$attempt',
    async ({ runId, mergeRunId, attempt, purged }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-power-'));
      const originalExitCode = process.exitCode;
      try {
        vi.stubEnv('SOURCE_RUN_ID', runId);
        vi.stubEnv('MERGE_RUN_ID', mergeRunId);
        vi.stubEnv('ARTIFACTS_PATH', dir);
        vi.stubEnv('INGEST_REQUIRE_POWER', 'true');
        vi.stubEnv('GITHUB_OUTPUT', '');
        mocks.metadata.mockReturnValue(JSON.stringify({ run_attempt: attempt }));
        mocks.artifacts.mockReturnValue([
          { name: 'changelog-metadata', created_at: '2026-10-01', archive_download_url: 'unused' },
          { name: 'bmk_example', created_at: '2026-10-01', archive_download_url: 'unused' },
        ]);
        mocks.download.mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        process.exitCode = 0;
        await import('./prepare-ci-artifacts');
        expect(process.exitCode).toBe(purged ? 0 : 1);
        if (purged) {
          expect(error).not.toHaveBeenCalled();
          if (runId !== mergeRunId) {
            const metadata = JSON.parse(
              fs.readFileSync(
                path.join(dir, 'reused-ingest-metadata/reuse_source_run.json'),
                'utf8',
              ),
            );
            expect(metadata).toMatchObject({ source_run_id: runId, source_run_attempt: attempt });
          }
        } else {
          expect(error).toHaveBeenCalledWith(
            'Required power: sweep manifest missing for required dispatch',
          );
        }
      } finally {
        process.exitCode = originalExitCode;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
