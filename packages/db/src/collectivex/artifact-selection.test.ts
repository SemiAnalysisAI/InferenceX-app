import { describe, expect, it } from 'vitest';

import { matrixArtifactName, selectShardArtifactNames } from './artifact-selection';

describe('selectShardArtifactNames', () => {
  it('selects one artifact per cell, sorted by name', () => {
    expect(
      selectShardArtifactNames(
        ['cxshard-b-160-1', 'cxshard-a-160-1', 'cxsweep-matrix-160'],
        '160',
        1,
      ),
    ).toEqual(['cxshard-a-160-1', 'cxshard-b-160-1']);
  });

  it('prefers the highest attempt not above the run attempt', () => {
    const names = ['cxshard-a-160-1', 'cxshard-a-160-2', 'cxshard-a-160-3', 'cxshard-b-160-1'];
    expect(selectShardArtifactNames(names, '160', 2)).toEqual([
      'cxshard-a-160-2',
      'cxshard-b-160-1',
    ]);
  });

  it('keeps cells with hyphenated names intact across run-id collisions', () => {
    // A cell name may itself contain "-<digits>" fragments; only the trailing
    // "-{runId}-{attempt}" is structural.
    const names = ['cxshard-h200-ep8-160-1', 'cxshard-h200-ep8-161-1'];
    expect(selectShardArtifactNames(names, '160', 1)).toEqual(['cxshard-h200-ep8-160-1']);
  });

  it('ignores foreign names and zero attempts', () => {
    expect(
      selectShardArtifactNames(['cxshard-a-160-0', 'other-160-1', 'cxshard-a-999-1'], '160', 1),
    ).toEqual([]);
  });
});

describe('matrixArtifactName', () => {
  it('derives the per-run matrix artifact name', () => {
    expect(matrixArtifactName('160')).toBe('cxsweep-matrix-160');
  });
});
