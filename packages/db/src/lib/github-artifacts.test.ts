import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const { mockExecSync, mockSpawn } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockSpawn: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execSync: mockExecSync, spawn: mockSpawn }));

import {
  RUNNER_SUFFIX_RE,
  assertRequestedRunAttempt,
  dedupeArtifactsByLogicalName,
  downloadArtifact,
  fetchRunAttempt,
} from './github-artifacts.js';

const art = (name: string, created_at: string) => ({
  name,
  archive_download_url: `https://api.github.com/${name}`,
  created_at,
});

describe('RUNNER_SUFFIX_RE', () => {
  it('strips the trailing runner-pool + attempt token', () => {
    expect('bmk_dsr1_conc4_h200-cw_00'.replace(RUNNER_SUFFIX_RE, '')).toBe('bmk_dsr1_conc4');
    expect('bmk_dsr1_conc4_h200-dgxc-slurm_1'.replace(RUNNER_SUFFIX_RE, '')).toBe('bmk_dsr1_conc4');
  });

  it('does not over-match across earlier underscore separators', () => {
    expect('bmk_agentic_glm5_offload_on_b200-nb_2'.replace(RUNNER_SUFFIX_RE, '')).toBe(
      'bmk_agentic_glm5_offload_on',
    );
    expect('server_logs_glm5'.replace(RUNNER_SUFFIX_RE, '')).toBe('server_logs_glm5');
  });
});

describe('dedupeArtifactsByLogicalName', () => {
  it('keeps only the most recent artifact per logical name', () => {
    const deduped = dedupeArtifactsByLogicalName([
      art('bmk_dsr1_conc4_h200-cw_00', '2026-06-01T00:00:00Z'),
      art('bmk_dsr1_conc4_h200-dgxc-slurm_1', '2026-06-02T00:00:00Z'),
      art('bmk_dsr1_conc8_h200-cw_00', '2026-06-01T00:00:00Z'),
    ]);
    expect([...deduped.keys()].toSorted()).toEqual(['bmk_dsr1_conc4', 'bmk_dsr1_conc8']);
    expect(deduped.get('bmk_dsr1_conc4')?.name).toBe('bmk_dsr1_conc4_h200-dgxc-slurm_1');
  });

  it('passes through names without a runner suffix unchanged', () => {
    const deduped = dedupeArtifactsByLogicalName([art('run-stats', '2026-06-01T00:00:00Z')]);
    expect(deduped.get('run-stats')?.name).toBe('run-stats');
  });
});

it('rejects a run URL whose requested attempt is no longer the current one', () => {
  const url = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1/attempts/1';
  expect(() => assertRequestedRunAttempt(url, 2)).toThrow(
    'GitHub attempt 2 differs from requested 1',
  );
  expect(() => assertRequestedRunAttempt(url, 1)).not.toThrow();
});

describe('fetchRunAttempt', () => {
  it('returns the attempt reported by GitHub', () => {
    mockExecSync.mockReturnValueOnce('3\n');
    expect(fetchRunAttempt('owner/repo', '42')).toBe(3);
  });

  it.each(['', 'null', 'abc', '0'])(
    'throws instead of defaulting when GitHub returns %j',
    (out) => {
      mockExecSync.mockReturnValueOnce(`${out}\n`);
      expect(() => fetchRunAttempt('owner/repo', '42')).toThrow(
        'GitHub returned no valid run_attempt for owner/repo run 42',
      );
    },
  );
});

describe('downloadArtifact', () => {
  it('stages concurrent downloads in separate zips', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-download-'));
    mockSpawn.mockImplementation(
      (command: string, args: string[], { stdio }: { stdio: (number | string)[] }) => {
        const listeners = new Map<string, (code: number, signal: null) => void>();
        const out = stdio[1];
        if (command === 'gh' && typeof out === 'number') fs.writeSync(out, args[1]);
        if (command === 'unzip') {
          fs.writeFileSync(path.join(args[3], 'body.txt'), fs.readFileSync(args[1]));
        }
        setImmediate(() => listeners.get('close')?.(0, null));
        return {
          once: (event: string, listener: (code: number, signal: null) => void) =>
            listeners.set(event, listener),
        };
      },
    );
    try {
      const dirs = await Promise.all([
        downloadArtifact(art('bmk_a', '2026-06-01T00:00:00Z'), root),
        downloadArtifact(art('bmk_b', '2026-06-01T00:00:00Z'), root),
      ]);
      expect(dirs.map((dir) => fs.readFileSync(path.join(dir, 'body.txt'), 'utf8'))).toEqual([
        'https://api.github.com/bmk_a',
        'https://api.github.com/bmk_b',
      ]);
      expect(fs.readdirSync(root).toSorted()).toEqual(['bmk_a', 'bmk_b']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

async function withStaging(run: (root: string, stagingDirs: string[]) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-download-'));
  const stagingDirs: string[] = [];
  const realMkdtemp = fs.mkdtempSync.bind(fs);
  const mkdtemp = vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix: string) => {
    const dir = realMkdtemp(prefix);
    stagingDirs.push(dir);
    return dir;
  });
  try {
    await run(root, stagingDirs);
  } finally {
    mkdtemp.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('downloadArtifact tool failures and cleanup', () => {
  type Exit = { code: number } | { error: Error };

  function fakeTools(exits: Partial<Record<string, Exit>> = {}) {
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(
      (command: string, args: string[], { stdio }: { stdio: (number | string)[] }) => {
        const listeners = new Map<string, (...values: unknown[]) => void>();
        const exit = exits[command] ?? { code: 0 };
        const out = stdio[1];
        if (command === 'gh' && typeof out === 'number') fs.writeSync(out, args[1]);
        if (command === 'unzip' && 'code' in exit && exit.code === 0) {
          fs.writeFileSync(path.join(args[3], 'body.txt'), fs.readFileSync(args[1]));
        }
        setImmediate(() => {
          if ('error' in exit) listeners.get('error')?.(exit.error);
          else listeners.get('close')?.(exit.code, null);
        });
        return {
          once: (event: string, listener: (...values: unknown[]) => void) =>
            listeners.set(event, listener),
        };
      },
    );
  }

  it('closes each zip, removes its staging dir and downloads the same artifact again', async () => {
    fakeTools();
    const closeSync = vi.spyOn(fs, 'closeSync');
    await withStaging(async (root, stagingDirs) => {
      const artifact = art('bmk_a', '2026-06-01T00:00:00Z');

      const first = await downloadArtifact(artifact, root);
      const second = await downloadArtifact(artifact, root);

      expect(second).toBe(first);
      expect(fs.readFileSync(path.join(second, 'body.txt'), 'utf8')).toBe(
        artifact.archive_download_url,
      );
      const zipFds = mockSpawn.mock.calls
        .filter(([command]) => command === 'gh')
        .map((call) => call[2].stdio[1]);
      expect(zipFds).toHaveLength(2);
      expect(closeSync.mock.calls.map(([fd]) => fd)).toEqual(expect.arrayContaining(zipFds));
      expect(stagingDirs).toHaveLength(2);
      expect(stagingDirs.filter((dir) => fs.existsSync(dir))).toEqual([]);
    });
    closeSync.mockRestore();
  });

  it('rejects with the failing download, never unzips and still cleans up', async () => {
    fakeTools({ gh: { code: 22 } });
    await withStaging(async (root, stagingDirs) => {
      await expect(downloadArtifact(art('bmk_a', '2026-06-01T00:00:00Z'), root)).rejects.toThrow(
        'gh api exited with 22',
      );
      expect(mockSpawn.mock.calls.map(([command]) => command)).toEqual(['gh']);
      expect(fs.existsSync(stagingDirs[0]!)).toBe(false);
    });
  });

  it('rejects when unzip fails, naming its first argument', async () => {
    fakeTools({ unzip: { code: 9 } });
    await withStaging(async (root, stagingDirs) => {
      await expect(downloadArtifact(art('bmk_a', '2026-06-01T00:00:00Z'), root)).rejects.toThrow(
        'unzip -oq exited with 9',
      );
      expect(fs.existsSync(stagingDirs[0]!)).toBe(false);
    });
  });

  it('rejects when a tool cannot start', { timeout: 2000 }, async () => {
    const missing = new Error('spawn gh ENOENT');
    fakeTools({ gh: { error: missing } });
    await withStaging(async (root) => {
      await expect(downloadArtifact(art('bmk_a', '2026-06-01T00:00:00Z'), root)).rejects.toBe(
        missing,
      );
    });
  });
});
