import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRunMeta: vi.fn(),
  buildDataset: vi.fn(),
  begin: vi.fn(),
}));
vi.mock('./lib/github-artifacts', () => ({
  fetchRunMeta: mocks.fetchRunMeta,
  listRunArtifacts: () => [],
  downloadArtifact: () => {},
}));
vi.mock('./collectivex/reader', () => ({
  isMatrixDoc: () => true,
  matrixVersion: () => 1,
  buildDatasetFromNeutral: mocks.buildDataset,
  buildRunSummary: () => ({ requested_cases: 0, measured_cases: 0, requested_points: 0 }),
}));
vi.mock('./etl/db-utils', () => ({
  createAdminSql: () => ({ begin: mocks.begin, end: () => Promise.resolve() }),
}));

const RUN_ID = '170';
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
});

// The script runs main() on import, so it must load after argv and the environment are set.
async function runCli(argv: string[]): Promise<void> {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.argv = ['bun', 'ingest-collectivex.ts', ...argv];
  await import('./ingest-collectivex');
}

describe('download-mode repository selection', () => {
  // A non-sweep workflow path stops the run right after the repository lookup.
  const otherWorkflow = { path: '.github/workflows/other.yml' };

  it.each([
    {
      name: 'the [repo] argument',
      argv: [
        '--download',
        `https://github.com/example-org/url-repo/actions/runs/${RUN_ID}`,
        'example-org/arg-repo',
      ],
      expected: 'example-org/arg-repo',
    },
    {
      name: 'a full run URL',
      argv: ['--download', `https://github.com/example-org/url-repo/actions/runs/${RUN_ID}`],
      expected: 'example-org/url-repo',
    },
    { name: 'INGEST_REPO', argv: ['--download', RUN_ID], expected: 'example-org/env-repo' },
  ])('prefers $name', async ({ argv, expected }) => {
    vi.stubEnv('INGEST_REPO', 'example-org/env-repo');
    mocks.fetchRunMeta.mockReturnValue(otherWorkflow);

    await runCli(argv);

    await vi.waitFor(() => expect(mocks.fetchRunMeta).toHaveBeenCalledWith(expected, RUN_ID));
  });

  it('falls back to the primary repository', async () => {
    vi.stubEnv('INGEST_REPO', '');
    mocks.fetchRunMeta.mockReturnValue(otherWorkflow);

    await runCli(['--download', RUN_ID]);

    await vi.waitFor(() =>
      expect(mocks.fetchRunMeta).toHaveBeenCalledWith('SemiAnalysisAI/InferenceX', RUN_ID),
    );
  });
});

describe('recorded source repository', () => {
  it.each([
    { repo: 'example-org/bench', recorded: 'example-org/bench' },
    { repo: 'semianalysisai/inferencex', recorded: undefined },
  ])('records $repo as $recorded', async ({ repo, recorded }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-ingest-test-'));
    try {
      fs.mkdirSync(path.join(dir, `cxsweep-matrix-${RUN_ID}`));
      fs.writeFileSync(path.join(dir, `cxsweep-matrix-${RUN_ID}`, 'matrix.json'), '{}');
      vi.stubEnv('INGEST_RUN_ID', RUN_ID);
      vi.stubEnv('INGEST_ARTIFACTS_PATH', dir);
      vi.stubEnv('INGEST_REPO', repo);
      mocks.fetchRunMeta.mockReturnValue({
        path: '.github/workflows/collectivex-sweep.yml',
        name: 'CollectiveX sweep',
        run_attempt: 1,
        head_sha: 'abc',
        head_branch: 'main',
        conclusion: 'success',
        created_at: '2026-08-01T00:00:00Z',
      });
      mocks.buildDataset.mockReturnValue({});
      mocks.begin.mockResolvedValue(undefined);

      await runCli([]);

      await vi.waitFor(() => expect(mocks.begin).toHaveBeenCalled());
      const meta = mocks.buildDataset.mock.calls[0][2] as Record<string, unknown>;
      expect(meta.source_repository).toBe(recorded);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
