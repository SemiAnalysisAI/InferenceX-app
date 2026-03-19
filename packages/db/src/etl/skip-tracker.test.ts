import { describe, it, expect } from 'vitest';
import { createSkipTracker } from './skip-tracker';

describe('createSkipTracker', () => {
  it('initializes with zeroed counters', () => {
    const tracker = createSkipTracker();
    expect(tracker.skips.badZip).toBe(0);
    expect(tracker.skips.unmappedModel).toBe(0);
    expect(tracker.skips.unmappedHw).toBe(0);
    expect(tracker.skips.noIslOsl).toBe(0);
    expect(tracker.skips.dbError).toBe(0);
  });

  it('initializes with empty unmapped sets', () => {
    const tracker = createSkipTracker();
    expect(tracker.unmappedModels.size).toBe(0);
    expect(tracker.unmappedHws.size).toBe(0);
  });

  it('allows mutating skip counters directly', () => {
    const tracker = createSkipTracker();
    tracker.skips.unmappedModel++;
    tracker.skips.unmappedHw += 5;
    expect(tracker.skips.unmappedModel).toBe(1);
    expect(tracker.skips.unmappedHw).toBe(5);
  });

  it('allows adding to unmapped sets', () => {
    const tracker = createSkipTracker();
    tracker.unmappedModels.add('unknown-model');
    tracker.unmappedHws.add('unknown-hw');
    expect(tracker.unmappedModels.has('unknown-model')).toBe(true);
    expect(tracker.unmappedHws.has('unknown-hw')).toBe(true);
  });
});

describe('recordDbError', () => {
  it('increments dbError counter', () => {
    const tracker = createSkipTracker();
    tracker.recordDbError('test context', new Error('test error'));
    expect(tracker.skips.dbError).toBe(1);
    tracker.recordDbError('test context 2', new Error('test error 2'));
    expect(tracker.skips.dbError).toBe(2);
  });

  it('continues counting after MAX_DB_ERRORS (10) without throwing', () => {
    const tracker = createSkipTracker();
    for (let i = 0; i < 15; i++) {
      tracker.recordDbError(`context ${i}`, new Error(`error ${i}`));
    }
    expect(tracker.skips.dbError).toBe(15);
  });
});

describe('snapshot', () => {
  it('captures current counters', () => {
    const tracker = createSkipTracker();
    tracker.skips.unmappedModel = 3;
    tracker.skips.unmappedHw = 2;
    tracker.skips.noIslOsl = 1;
    tracker.unmappedModels.add('model-a');

    const snap = tracker.snapshot();
    expect(snap.model).toBe(3);
    expect(snap.hw).toBe(2);
    expect(snap.islOsl).toBe(1);
    expect(snap.models.has('model-a')).toBe(true);
  });

  it('returns a copy — mutating tracker does not change snapshot', () => {
    const tracker = createSkipTracker();
    tracker.skips.unmappedModel = 5;
    tracker.unmappedModels.add('x');

    const snap = tracker.snapshot();

    tracker.skips.unmappedModel = 10;
    tracker.unmappedModels.add('y');

    expect(snap.model).toBe(5);
    expect(snap.models.has('y')).toBe(false);
  });
});

describe('diff', () => {
  it('computes incremental change since snapshot', () => {
    const tracker = createSkipTracker();
    tracker.skips.unmappedModel = 2;
    tracker.skips.unmappedHw = 1;
    tracker.skips.noIslOsl = 0;
    tracker.unmappedModels.add('existing-model');

    const snap = tracker.snapshot();

    // Simulate processing more rows
    tracker.skips.unmappedModel += 3;
    tracker.skips.unmappedHw += 2;
    tracker.skips.noIslOsl += 1;
    tracker.unmappedModels.add('new-model');
    tracker.unmappedHws.add('new-hw');

    const d = tracker.diff(snap);
    expect(d.droppedModel).toBe(3);
    expect(d.droppedHw).toBe(2);
    expect(d.droppedIslOsl).toBe(1);
    expect(d.newModels).toEqual(['new-model']);
    expect(d.newHws).toEqual(['new-hw']);
  });

  it('returns zeros when nothing changed', () => {
    const tracker = createSkipTracker();
    const snap = tracker.snapshot();
    const d = tracker.diff(snap);

    expect(d.droppedModel).toBe(0);
    expect(d.droppedHw).toBe(0);
    expect(d.droppedIslOsl).toBe(0);
    expect(d.newModels).toEqual([]);
    expect(d.newHws).toEqual([]);
  });

  it('does not include pre-existing unmapped names in newModels/newHws', () => {
    const tracker = createSkipTracker();
    tracker.unmappedModels.add('old');
    tracker.unmappedHws.add('old-hw');

    const snap = tracker.snapshot();

    // Add the same ones again — they should not appear as new
    tracker.unmappedModels.add('old');
    tracker.unmappedHws.add('old-hw');

    const d = tracker.diff(snap);
    expect(d.newModels).toEqual([]);
    expect(d.newHws).toEqual([]);
  });
});
