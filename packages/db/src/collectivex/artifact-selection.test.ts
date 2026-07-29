import { describe, expect, it } from 'vitest';

import {
  matrixArtifactName,
  selectShardArtifactNames,
  selectShardArtifacts,
} from './artifact-selection';

describe('shard artifact selection', () => {
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
  it('breaks same-attempt ties on the later artifact id', () => {
    // GitHub permits a repeated artifact name within one run; the lazy ingest has
    // ids and must keep the later upload. Both ingest paths share this selector,
    // so the tie-break cannot drift between them again.
    const artifacts = [
      { name: 'cxshard-a-160-1', id: 10 },
      { name: 'cxshard-a-160-1', id: 42 },
    ];
    expect(selectShardArtifacts(artifacts, '160', 1)).toEqual([
      { name: 'cxshard-a-160-1', id: 42 },
    ]);
  });

  it('keeps the first match when callers supply no ids', () => {
    // The names-only path has no id to compare, so it stays deterministic on input order.
    expect(
      selectShardArtifacts([{ name: 'cxshard-a-160-1' }, { name: 'cxshard-a-160-1' }], '160', 1),
    ).toHaveLength(1);
  });

  it('treats a run id with regex metacharacters literally', () => {
    // The id is interpolated into the pattern; an unescaped '.' would match any char.
    expect(selectShardArtifactNames(['cxshard-a-1x0-1'], '1.0', 1)).toEqual([]);
  });
});

describe('matrixArtifactName', () => {
  it('derives the per-run matrix artifact name', () => {
    expect(matrixArtifactName('160')).toBe('cxsweep-matrix-160');
  });
});
