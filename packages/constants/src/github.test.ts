import { describe, expect, it } from 'vitest';

import { benchmarkSourceRepos } from './github';

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
    'example-org/..',
    './bench',
  ])('rejects the malformed entry %j', (entry) => {
    expect(() =>
      benchmarkSourceRepos({ INFERENCEX_SOURCE_REPOS: `example-org/bench,${entry}` }),
    ).toThrow(`Invalid repo slug in INFERENCEX_SOURCE_REPOS: ${entry}`);
  });
});
