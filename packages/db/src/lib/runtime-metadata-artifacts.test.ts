import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import type { ArtifactMeta } from './github-artifacts';
import {
  repositoryFromRunUrl,
  selectBenchmarkArtifacts,
  storedRunRepository,
} from './runtime-metadata-artifacts';
import { stubEnv, unstubAllEnvs } from './test-helpers';

afterEach(() => {
  unstubAllEnvs();
});

describe('storedRunRepository', () => {
  it('reads the repository from the run URL', () => {
    expect(
      storedRunRepository({
        github_run_id: 1,
        html_url: 'https://github.com/example-org/example-repo/actions/runs/1',
      }),
    ).toBe('example-org/example-repo');
  });

  it('reports a run without a URL instead of guessing INGEST_REPO', () => {
    stubEnv('INGEST_REPO', 'example-org/public-repo');
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(storedRunRepository({ github_run_id: 101, html_url: null })).toBeNull();
      expect(String(error.mock.calls[0]?.[0])).toContain('run 101: no GitHub run URL');
    } finally {
      error.mockRestore();
    }
  });
});

const artifact = (name: string, created_at = '2026-07-16T00:00:00Z'): ArtifactMeta => ({
  name,
  created_at,
  archive_download_url: `https://example.com/${name}`,
});

describe('repositoryFromRunUrl', () => {
  it('extracts public and private GitHub repositories', () => {
    expect(
      repositoryFromRunUrl(
        'https://github.com/SemiAnalysisAI/InferenceX-Private/actions/runs/29357450774',
      ),
    ).toBe('SemiAnalysisAI/InferenceX-Private');
  });

  it('returns null for missing or unrelated URLs', () => {
    expect(repositoryFromRunUrl(null)).toBeNull();
    expect(repositoryFromRunUrl('https://example.com/actions/runs/1')).toBeNull();
  });
});

describe('selectBenchmarkArtifacts', () => {
  it('prefers the compact aggregate benchmark artifact', () => {
    expect(
      selectBenchmarkArtifacts([
        artifact('bmk_agentic_config_a_01'),
        artifact('results_bmk'),
        artifact('server_logs_config_a'),
      ]).map((entry) => entry.name),
    ).toEqual(['results_bmk']);
  });

  it('falls back to deduplicated per-config benchmark artifacts', () => {
    expect(
      selectBenchmarkArtifacts([
        artifact('bmk_agentic_config_a_runner_01', '2026-07-16T00:00:00Z'),
        artifact('bmk_agentic_config_a_runner_02', '2026-07-16T01:00:00Z'),
        artifact('server_logs_config_a'),
      ]).map((entry) => entry.name),
    ).toEqual(['bmk_agentic_config_a_runner_02']);
  });
});
