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
vi.mock('node:timers/promises', () => ({ setTimeout: () => Promise.resolve() }));

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

describe('artifact downloads', () => {
  const names = Array.from({ length: 20 }, (_, i) => `bmk_${String(i).padStart(2, '0')}`);

  async function prepare(download: (name: string, root: string) => Promise<void>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-pool-'));
    vi.stubEnv('SOURCE_RUN_ID', '35855544139');
    vi.stubEnv('MERGE_RUN_ID', '35855544139');
    vi.stubEnv('ARTIFACTS_PATH', dir);
    vi.stubEnv('INGEST_REPO', 'SemiAnalysisAI/InferenceX');
    vi.stubEnv('GITHUB_OUTPUT', '');
    mocks.metadata.mockReturnValue(JSON.stringify({ run_attempt: 1 }));
    // Listed newest-name-first so the plan's sort, not the listing, sets the order.
    mocks.artifacts.mockReturnValue(
      names.toReversed().map((name) => ({
        name,
        created_at: '2026-10-01',
        archive_download_url: name,
      })),
    );
    mocks.download.mockImplementation(({ name }: { name: string }, root: string) =>
      download(name, root),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = 0;
    await import('./prepare-ci-artifacts');
    const started = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith('Downloading artifact: '))
      .map((line) => line.slice('Downloading artifact: '.length));
    return { dir, started, error };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads eight at a time in plan order', async () => {
    const originalExitCode = process.exitCode;
    const gates: (() => void)[] = [];
    let peak = 0;
    const { dir, started } = await prepare(async (name, root) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      gates.push(resolve);
      peak = Math.max(peak, gates.length);
      // Once every start in this turn has run, finish the newest download, so
      // completion order differs from start order.
      setImmediate(() => gates.pop()?.());
      await promise;
      fs.mkdirSync(path.join(root, name));
    });
    try {
      expect(process.exitCode).toBe(0);
      expect(peak).toBe(8);
      expect(started).toEqual(names);
      expect(fs.readdirSync(dir).toSorted()).toEqual(names);
    } finally {
      process.exitCode = originalExitCode;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('starts nothing new after a download exhausts its retries', async () => {
    const originalExitCode = process.exitCode;
    const { dir, started, error } = await prepare(async (name, root) => {
      if (name === 'bmk_02') throw new Error('network');
      // The failing download retries within this turn, so it fails before any other finishes.
      const { promise, resolve } = Promise.withResolvers<void>();
      setImmediate(resolve);
      await promise;
      fs.mkdirSync(path.join(root, name));
    });
    try {
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith('Failed to download artifact bmk_02 after 3 attempts');
      expect(mocks.download.mock.calls.filter(([{ name }]) => name === 'bmk_02')).toHaveLength(3);
      expect(started).toEqual(names.slice(0, 8));
      expect(fs.readdirSync(dir).toSorted()).toEqual(
        names.slice(0, 8).filter((n) => n !== 'bmk_02'),
      );
    } finally {
      process.exitCode = originalExitCode;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
