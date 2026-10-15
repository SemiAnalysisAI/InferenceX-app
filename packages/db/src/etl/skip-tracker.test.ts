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
    expect(tracker.skips.traceReplayMissing).toBe(0);
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
    tracker.recordDbError('benchmark', 'a.json', new Error('test error'));
    expect(tracker.skips.dbError).toBe(1);
    tracker.recordDbError('benchmark', 'b.json', new Error('test error 2'));
    expect(tracker.skips.dbError).toBe(2);
  });

  it('continues counting after MAX_DB_ERRORS (10) without throwing', () => {
    const tracker = createSkipTracker();
    for (let i = 0; i < 15; i++) {
      tracker.recordDbError('benchmark', `context ${i}`, new Error(`error ${i}`));
    }
    expect(tracker.skips.dbError).toBe(15);
    expect(tracker.dbWriteErrors).toHaveLength(15);
  });

  it('keeps kind, subject, message and SQLSTATE', () => {
    const tracker = createSkipTracker();
    tracker.recordDbError(
      'server_logs',
      'qwen3.5_conc12288',
      Object.assign(new Error('write CONNECTION_CLOSED'), { code: 'CONNECTION_CLOSED' }),
    );
    tracker.recordDbError(
      'config',
      'result.json',
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );
    expect(tracker.dbWriteErrors).toEqual([
      {
        kind: 'server_logs',
        subject: 'qwen3.5_conc12288',
        message: 'write CONNECTION_CLOSED',
        code: 'CONNECTION_CLOSED',
      },
      { kind: 'config', subject: 'result.json', message: 'duplicate key', code: '23505' },
    ]);
  });

  it('omits code when the error has none, and reads it from the cause', () => {
    const tracker = createSkipTracker();
    tracker.recordDbError('trace_replay', 'glm5 conc 64', new Error('Authentication timed out'));
    tracker.recordDbError(
      'benchmark',
      'b.json',
      new Error('batch failed', { cause: Object.assign(new Error('x'), { code: '57014' }) }),
    );
    tracker.recordDbError('changelog', 'a..b', 'plain string failure');
    expect(tracker.dbWriteErrors).toEqual([
      { kind: 'trace_replay', subject: 'glm5 conc 64', message: 'Authentication timed out' },
      { kind: 'benchmark', subject: 'b.json', message: 'batch failed', code: '57014' },
      { kind: 'changelog', subject: 'a..b', message: 'plain string failure' },
    ]);
  });

  it('bounds very long messages', () => {
    const tracker = createSkipTracker();
    tracker.recordDbError('benchmark', 'big.json', new Error('x'.repeat(10_000)));
    expect(tracker.dbWriteErrors[0]!.message.length).toBeLessThan(2100);
    expect(tracker.dbWriteErrors[0]!.message).toMatch(/\(truncated\)$/u);
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
