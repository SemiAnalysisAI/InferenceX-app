import { describe, expect, it } from 'vitest';

import type { ArtifactMeta } from './github-artifacts';
import { repositoryFromRunUrl, selectBenchmarkArtifacts } from './runtime-metadata-artifacts';

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
