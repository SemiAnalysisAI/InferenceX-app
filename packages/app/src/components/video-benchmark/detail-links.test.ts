import { describe, expect, it } from 'vitest';
import { VIDEO_REPRODUCE_URL, detailLinks } from './detail-links';

describe('detailLinks', () => {
  it('links the run, its artifact and the reproduce guide for a stored point', () => {
    expect(detailLinks({ runId: '41812249525', artifactId: 4242 })).toEqual([
      {
        action: 'run',
        href: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/41812249525',
      },
      {
        action: 'artifact',
        href: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/41812249525/artifacts/4242',
      },
      { action: 'reproduce', href: VIDEO_REPRODUCE_URL },
    ]);
  });

  it('drops the artifact link when the artifact ID is missing', () => {
    expect(detailLinks({ runId: '123', artifactId: 0 }).map((link) => link.action)).toEqual([
      'run',
      'reproduce',
    ]);
  });

  it('never builds a GitHub URL from a malformed run ID', () => {
    for (const runId of ['', 'abc', '12/../34', '0']) {
      expect(detailLinks({ runId, artifactId: 7 }).map((link) => link.action)).toEqual([
        'reproduce',
      ]);
    }
  });
});
