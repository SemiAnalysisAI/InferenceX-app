import { afterEach, describe, expect, it, vi } from 'vitest';

import { benchmarkSourceRepos, workflowRunRepos } from './github';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('benchmarkSourceRepos', () => {
  it('searches only the primary repository when no source repositories are configured', () => {
    expect(benchmarkSourceRepos({})).toEqual(['SemiAnalysisAI/InferenceX']);
    expect(benchmarkSourceRepos({ INFERENCEX_SOURCE_REPOS: '' })).toEqual([
      'SemiAnalysisAI/InferenceX',
    ]);
    expect(benchmarkSourceRepos({ INFERENCEX_SOURCE_REPOS: ' , ,' })).toEqual([
      'SemiAnalysisAI/InferenceX',
    ]);
  });

  it('appends configured repositories after the primary in order, without duplicates', () => {
    expect(
      benchmarkSourceRepos({
        INFERENCEX_SOURCE_REPOS:
          ' example-org/bench-a, semianalysisai/inferencex ,example-org/bench.b_2,Example-Org/Bench-A ',
      }),
    ).toEqual(['SemiAnalysisAI/InferenceX', 'example-org/bench-a', 'example-org/bench.b_2']);
  });

  it.each([
    'example-org',
    'example-org/bench/extra',
    'https://github.com/example-org/bench',
    'example org/bench',
    '/bench',
  ])('rejects the malformed entry %j', (entry) => {
    expect(() =>
      benchmarkSourceRepos({ INFERENCEX_SOURCE_REPOS: `example-org/bench,${entry}` }),
    ).toThrow(`Invalid repo slug in INFERENCEX_SOURCE_REPOS: ${entry}`);
  });

  it('reads process.env by default', () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', undefined);
    expect(benchmarkSourceRepos()).toEqual(['SemiAnalysisAI/InferenceX']);

    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench');
    expect(benchmarkSourceRepos()).toEqual(['SemiAnalysisAI/InferenceX', 'example-org/bench']);
  });
});

describe('workflowRunRepos', () => {
  it('matches the current and legacy repositories by default', () => {
    expect(workflowRunRepos({})).toEqual([
      'SemiAnalysisAI/InferenceX',
      'InferenceMAX/InferenceMAX',
    ]);
  });

  it('searches configured source repositories before the legacy repository', () => {
    expect(workflowRunRepos({ INFERENCEX_SOURCE_REPOS: 'example-org/bench' })).toEqual([
      'SemiAnalysisAI/InferenceX',
      'example-org/bench',
      'InferenceMAX/InferenceMAX',
    ]);
  });

  it('lists the legacy repository once even when it is configured as a source', () => {
    expect(
      workflowRunRepos({ INFERENCEX_SOURCE_REPOS: 'inferencemax/inferencemax,example-org/bench' }),
    ).toEqual(['SemiAnalysisAI/InferenceX', 'inferencemax/inferencemax', 'example-org/bench']);
  });

  it('reads process.env by default', () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench');
    expect(workflowRunRepos()).toEqual([
      'SemiAnalysisAI/InferenceX',
      'example-org/bench',
      'InferenceMAX/InferenceMAX',
    ]);
  });
});
