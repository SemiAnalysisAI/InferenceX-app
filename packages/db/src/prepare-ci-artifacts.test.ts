import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  metadata: vi.fn(),
  artifacts: vi.fn(),
  download: vi.fn(),
  sleep: vi.fn((_ms: number) => Promise.resolve()),
}));
vi.mock('node:child_process', () => ({ execFile: vi.fn(), execFileSync: mocks.metadata }));
vi.mock('./lib/github-artifacts.js', () => ({
  listRunArtifacts: mocks.artifacts,
  downloadArtifact: mocks.download,
}));
vi.mock('node:timers/promises', () => ({ setTimeout: mocks.sleep }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
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

  it('waits 1 s, then 2 s, before each retry of a failed download', async () => {
    const originalExitCode = process.exitCode;
    const events: string[] = [];
    for (let i = 0; i < 2; i++) {
      mocks.sleep.mockImplementationOnce((ms: number) => {
        events.push(`sleep ${ms}`);
        const { promise, resolve } = Promise.withResolvers<void>();
        setImmediate(() => {
          events.push(`woke ${ms}`);
          resolve();
        });
        return promise;
      });
    }
    let failures = 2;
    const { dir } = await prepare((name, root) => {
      if (name === 'bmk_05') {
        events.push('download');
        if (failures-- > 0) return Promise.reject(new Error('network'));
      }
      fs.mkdirSync(path.join(root, name));
      return Promise.resolve();
    });
    try {
      expect(process.exitCode).toBe(0);
      expect(events).toEqual([
        'download',
        'sleep 1000',
        'woke 1000',
        'download',
        'sleep 2000',
        'woke 2000',
        'download',
      ]);
      expect(fs.readdirSync(dir).toSorted()).toEqual(names);
    } finally {
      process.exitCode = originalExitCode;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
