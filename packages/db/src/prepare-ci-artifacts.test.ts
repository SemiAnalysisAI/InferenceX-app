import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = fileURLToPath(
  new URL('../../../docs/fixtures/powerx-manifest-v2/artifacts/', import.meta.url),
);
const mocks = vi.hoisted(() => ({ names: [] as string[], fixture: '', corrupt: false }));
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => JSON.stringify({ head_sha: 'b'.repeat(40), run_attempt: 1 })),
}));
vi.mock('./lib/github-artifacts.js', () => ({
  listRunArtifacts: () =>
    mocks.names.map((name, id) => ({
      id,
      name,
      expired: false,
      created_at: '2026-09-16T00:00:00Z',
    })),
  downloadArtifact: (artifact: { name: string }, root: string) => {
    fs.cpSync(path.join(mocks.fixture, artifact.name), path.join(root, artifact.name), {
      recursive: true,
    });
    if (mocks.corrupt && artifact.name === 'agentic_golden')
      fs.appendFileSync(path.join(root, artifact.name, 'gpu_metrics.csv'), 'corrupt\n');
  },
}));

let directory: string;
let originalArgs: string[];
let originalExitCode: typeof process.exitCode;
beforeEach(() => {
  vi.resetModules();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'power-prepare-'));
  mocks.fixture = fixture;
  mocks.names = fs.readdirSync(fixture);
  mocks.corrupt = false;
  originalArgs = process.argv;
  originalExitCode = process.exitCode;
  process.argv = ['bun', 'prepare-ci-artifacts.ts'];
  process.exitCode = undefined;
  vi.stubEnv('SOURCE_RUN_ID', '123');
  vi.stubEnv('MERGE_RUN_ID', '123');
  vi.stubEnv('ARTIFACTS_PATH', directory);
  vi.stubEnv('INGEST_REQUIRE_POWER', 'true');
  vi.stubEnv('GITHUB_OUTPUT', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgs;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('artifact preparation gate before migrations', () => {
  it('preserves earlier successful artifacts when only failed jobs are rerun', async () => {
    vi.mocked(execFileSync).mockReturnValueOnce(
      JSON.stringify({
        head_sha: 'b'.repeat(40),
        run_attempt: 2,
        run_started_at: '2026-09-17T00:00:00Z',
      }),
    );
    await import('./prepare-ci-artifacts');
    expect(process.exitCode).toBeUndefined();
    expect(fs.readdirSync(directory).toSorted()).toEqual(mocks.names.toSorted());
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('declared attempt 1, ingest attempt 2'),
    );
  });

  it('accepts the actual golden source bundle without a database connection', async () => {
    await import('./prepare-ci-artifacts');
    expect(process.exitCode).toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('fails the preparation command when both manifest and changelog are lost', async () => {
    mocks.names = mocks.names.filter(
      (name) => name !== 'required-power-sweep-manifest' && name !== 'changelog-metadata',
    );
    await import('./prepare-ci-artifacts');
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('required dispatch'));
  });

  it('fails preparation on corrupt downloaded telemetry', async () => {
    mocks.corrupt = true;
    await import('./prepare-ci-artifacts');
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('hash'));
  });

  it('retains optional-power compatibility when there is no required marker', async () => {
    vi.stubEnv('INGEST_REQUIRE_POWER', 'false');
    mocks.names = ['bmk_agentic_golden'];
    await import('./prepare-ci-artifacts');
    expect(process.exitCode).toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });
});
