import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        vi.stubEnv('INGEST_REPO', 'SemiAnalysisAI/InferenceX');
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

describe('reuse metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits when INGEST_REPO is unset', async () => {
    const originalExitCode = process.exitCode;
    try {
      vi.stubEnv('SOURCE_RUN_ID', '35855544139');
      vi.stubEnv('MERGE_RUN_ID', '99999999999');
      vi.stubEnv('INGEST_REPO', '');
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });
      process.exitCode = 0;

      await import('./prepare-ci-artifacts');

      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith('INGEST_REPO is not set');
      expect(process.exitCode).toBe(1);
      expect(mocks.metadata).not.toHaveBeenCalled();
      expect(mocks.artifacts).not.toHaveBeenCalled();
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it.each([
    { ingestRepo: 'SemiAnalysisAI/InferenceX', repo: 'SemiAnalysisAI/InferenceX' },
    { ingestRepo: 'example-org/bench', repo: 'example-org/bench' },
  ])('links runs without an html_url to $repo', async ({ ingestRepo, repo }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-reuse-'));
    const originalExitCode = process.exitCode;
    try {
      vi.stubEnv('SOURCE_RUN_ID', '35855544139');
      vi.stubEnv('MERGE_RUN_ID', '99999999999');
      vi.stubEnv('ARTIFACTS_PATH', dir);
      vi.stubEnv('INGEST_REPO', ingestRepo);
      vi.stubEnv('GITHUB_OUTPUT', '');
      mocks.metadata.mockReturnValue(JSON.stringify({ run_attempt: 2 }));
      mocks.artifacts.mockReturnValue([
        { name: 'changelog-metadata', created_at: '2026-10-01', archive_download_url: 'unused' },
        { name: 'bmk_example', created_at: '2026-10-01', archive_download_url: 'unused' },
      ]);
      mocks.download.mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.exitCode = 0;

      // The script runs main() on import, so it must load after the environment is stubbed.
      await import('./prepare-ci-artifacts');

      expect(error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
      expect(mocks.metadata.mock.calls.map(([, args]) => args)).toEqual([
        ['api', `repos/${repo}/actions/runs/35855544139`],
        ['api', `repos/${repo}/actions/runs/99999999999`],
      ]);
      expect(mocks.artifacts.mock.calls).toEqual([
        [repo, '35855544139'],
        [repo, '99999999999'],
      ]);
      const metadata = JSON.parse(
        fs.readFileSync(path.join(dir, 'reused-ingest-metadata/reuse_source_run.json'), 'utf8'),
      );
      expect(metadata).toMatchObject({
        source_run_url: `https://github.com/${repo}/actions/runs/35855544139`,
        ingest_run_url: `https://github.com/${repo}/actions/runs/99999999999`,
      });
    } finally {
      process.exitCode = originalExitCode;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
