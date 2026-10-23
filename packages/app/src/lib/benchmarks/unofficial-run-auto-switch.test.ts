import { describe, expect, it } from 'vitest';

import type { AvailableModelSequence } from '@/providers/unofficial-run-provider';
import { Model, Sequence } from '@/lib/catalog/data-mappings';

import { computeAutoSwitchDecision } from './unofficial-run-auto-switch';

function entry(model: Model, sequence: Sequence): AvailableModelSequence {
  return { model, sequence, precisions: [] };
}

describe('computeAutoSwitchDecision', () => {
  it('returns no-op and resets the key when no unofficial run is loaded', () => {
    expect(computeAutoSwitchDecision([], undefined, Model.DeepSeek_R1, 'stale-key')).toEqual({
      nextKey: '',
      modelToSet: null,
    });
  });

  it('switches to the run model when g_model is not pinned and current model is not covered', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const decision = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, '');
    expect(decision.modelToSet).toBe(Model.DeepSeek_V4_Pro);
    expect(decision.nextKey).toBe(Model.DeepSeek_V4_Pro);
  });

  it('respects an explicit g_model URL param even when the run lacks that model', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const decision = computeAutoSwitchDecision(run, Model.DeepSeek_R1, Model.DeepSeek_R1, '');
    expect(decision.modelToSet).toBeNull();
    expect(decision.nextKey).toBe('');
  });

  it('does not switch when the current model is already covered by the overlay', () => {
    const run = [
      entry(Model.DeepSeek_R1, Sequence.OneK_OneK),
      entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK),
    ];
    const decision = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, '');
    expect(decision.modelToSet).toBeNull();
    expect(decision.nextKey).toBe([Model.DeepSeek_R1, Model.DeepSeek_V4_Pro].toSorted().join(','));
  });

  it('does not re-fire after a manual model change against the same run set', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const lastKey = Model.DeepSeek_V4_Pro;
    const decision = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, lastKey);
    expect(decision.modelToSet).toBeNull();
    expect(decision.nextKey).toBe(lastKey);
  });

  it('re-arms after the overlay set is cleared so a subsequent load can switch again', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const first = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, '');
    expect(first.modelToSet).toBe(Model.DeepSeek_V4_Pro);

    const cleared = computeAutoSwitchDecision([], undefined, Model.DeepSeek_V4_Pro, first.nextKey);
    expect(cleared).toEqual({ nextKey: '', modelToSet: null });

    const run2 = [entry(Model.Kimi_K2_5, Sequence.OneK_OneK)];
    const second = computeAutoSwitchDecision(
      run2,
      undefined,
      Model.DeepSeek_V4_Pro,
      cleared.nextKey,
    );
    expect(second.modelToSet).toBe(Model.Kimi_K2_5);
  });

  it('ignores sequence-only changes in the dedupe key', () => {
    const oneK = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const both = [
      entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK),
      entry(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK),
    ];
    const first = computeAutoSwitchDecision(oneK, undefined, Model.DeepSeek_R1, '');
    const second = computeAutoSwitchDecision(both, undefined, Model.DeepSeek_V4_Pro, first.nextKey);
    expect(first.nextKey).toBe(second.nextKey);
    expect(second.modelToSet).toBeNull();
  });

  it('picks the first model deterministically across insertion orders', () => {
    const orderA = [
      entry(Model.MiniMax_M2_5, Sequence.OneK_OneK),
      entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK),
      entry(Model.Kimi_K2_5, Sequence.OneK_OneK),
    ];
    const orderB = [
      entry(Model.Kimi_K2_5, Sequence.OneK_OneK),
      entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK),
      entry(Model.MiniMax_M2_5, Sequence.OneK_OneK),
    ];
    const a = computeAutoSwitchDecision(orderA, undefined, Model.DeepSeek_R1, '');
    const b = computeAutoSwitchDecision(orderB, undefined, Model.DeepSeek_R1, '');
    expect(a.modelToSet).toBe(b.modelToSet);
    expect(a.nextKey).toBe(b.nextKey);
  });
});
