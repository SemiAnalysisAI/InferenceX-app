import { describe, expect, it } from 'vitest';

import type { AvailableModelSequence } from '@/components/unofficial-run-provider';
import { Model, Sequence } from '@/lib/data-mappings';

import {
  computeAutoSwitchDecision,
  computeUnofficialOverrideDecision,
  selectUnofficialDefaultSequence,
} from './unofficial-run-auto-switch';

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
    // Ref must not be advanced — if the URL is later cleared we still want
    // a fresh load of the same run to be able to fire the switch.
    expect(decision.nextKey).toBe('');
  });

  it('does not switch when the current model is already covered by the overlay', () => {
    const run = [
      entry(Model.DeepSeek_R1, Sequence.OneK_OneK),
      entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK),
    ];
    const decision = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, '');
    expect(decision.modelToSet).toBeNull();
    // Key still advances so we don't keep re-evaluating on every render.
    expect(decision.nextKey).toBe([Model.DeepSeek_R1, Model.DeepSeek_V4_Pro].toSorted().join(','));
  });

  it('does not re-fire after a manual model change against the same run set', () => {
    // Simulate the post-auto-switch state: ref already holds the run's key,
    // user manually switched back to a model the run does not cover.
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const lastKey = Model.DeepSeek_V4_Pro;
    const decision = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, lastKey);
    expect(decision.modelToSet).toBeNull();
    expect(decision.nextKey).toBe(lastKey);
  });

  it('re-arms after the overlay set is cleared so a subsequent load can switch again', () => {
    // Step 1: a run is loaded, switch fires.
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const first = computeAutoSwitchDecision(run, undefined, Model.DeepSeek_R1, '');
    expect(first.modelToSet).toBe(Model.DeepSeek_V4_Pro);

    // Step 2: user dismisses the run, overlay set goes empty — ref resets.
    const cleared = computeAutoSwitchDecision([], undefined, Model.DeepSeek_V4_Pro, first.nextKey);
    expect(cleared).toEqual({ nextKey: '', modelToSet: null });

    // Step 3: a *different* run is loaded with a different model. The cleared
    // ref allows the switch to fire again.
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
    // Same model, two sequences appearing across renders. The decision logic
    // only branches on model, so the key should not change when a new
    // sequence arrives for an already-covered model — otherwise the effect
    // would re-evaluate (and bail) on every sequence delta.
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
    // Same set of models in two different orders should produce the same
    // auto-picked target — protecting against `Object.keys`-driven nondeterminism
    // in `parseAvailableModelsAndSequences`.
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

describe('computeUnofficialOverrideDecision', () => {
  it('returns no-op and resets the key when no unofficial run is loaded', () => {
    expect(computeUnofficialOverrideDecision([], undefined, 'stale-key')).toEqual({
      nextKey: '',
      shouldOverride: false,
    });
  });

  it('fires the override on a fresh run set when the URL does not pin the param', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const decision = computeUnofficialOverrideDecision(run, undefined, '');
    expect(decision.shouldOverride).toBe(true);
    expect(decision.nextKey).toBe(Model.DeepSeek_V4_Pro);
  });

  it('respects an explicit URL pin even on a fresh run set', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const decision = computeUnofficialOverrideDecision(run, '1k/1k', '');
    expect(decision.shouldOverride).toBe(false);
    // Ref must not be advanced — if the URL is later cleared we still want
    // a fresh load of the same run to fire the override.
    expect(decision.nextKey).toBe('');
  });

  it('does not re-fire after the override has already been applied for this run set', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const lastKey = Model.DeepSeek_V4_Pro;
    const decision = computeUnofficialOverrideDecision(run, undefined, lastKey);
    expect(decision.shouldOverride).toBe(false);
    expect(decision.nextKey).toBe(lastKey);
  });

  it('re-arms after the overlay set is cleared so a subsequent load can override again', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const first = computeUnofficialOverrideDecision(run, undefined, '');
    expect(first.shouldOverride).toBe(true);

    const cleared = computeUnofficialOverrideDecision([], undefined, first.nextKey);
    expect(cleared).toEqual({ nextKey: '', shouldOverride: false });

    const run2 = [entry(Model.Kimi_K2_5, Sequence.OneK_OneK)];
    const second = computeUnofficialOverrideDecision(run2, undefined, cleared.nextKey);
    expect(second.shouldOverride).toBe(true);
  });

  it('ignores sequence-only deltas in the dedupe key', () => {
    const oneK = [entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK)];
    const both = [
      entry(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK),
      entry(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK),
    ];
    const first = computeUnofficialOverrideDecision(oneK, undefined, '');
    const second = computeUnofficialOverrideDecision(both, undefined, first.nextKey);
    expect(first.nextKey).toBe(second.nextKey);
    expect(second.shouldOverride).toBe(false);
  });

  it('produces a deterministic key across insertion orders', () => {
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
    const a = computeUnofficialOverrideDecision(orderA, undefined, '');
    const b = computeUnofficialOverrideDecision(orderB, undefined, '');
    expect(a.nextKey).toBe(b.nextKey);
    expect(a.shouldOverride).toBe(b.shouldOverride);
  });
});

describe('selectUnofficialDefaultSequence', () => {
  it('prefers 8k/256 when the displayed model provides it', () => {
    const run = [
      entry(Model.DeepSeek_V4_Pro, Sequence.EightK_625),
      entry(Model.DeepSeek_V4_Pro, Sequence.EightK_256),
    ];
    expect(selectUnofficialDefaultSequence(run, Model.DeepSeek_V4_Pro, undefined)).toBe(
      Sequence.EightK_256,
    );
  });

  it('uses the run sequence when 8k/256 is unavailable', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.EightK_625)];
    expect(selectUnofficialDefaultSequence(run, Model.DeepSeek_R1, undefined)).toBe(
      Sequence.EightK_625,
    );
  });

  it('chooses a sequence for the current covered model', () => {
    const run = [
      entry(Model.DeepSeek_V4_Pro, Sequence.EightK_625),
      entry(Model.Kimi_K2_5, Sequence.OneK_OneK),
    ];
    expect(selectUnofficialDefaultSequence(run, Model.Kimi_K2_5, undefined)).toBe(
      Sequence.OneK_OneK,
    );
  });

  it('uses an explicitly pinned model when selecting the sequence', () => {
    const run = [
      entry(Model.DeepSeek_V4_Pro, Sequence.EightK_625),
      entry(Model.Kimi_K2_5, Sequence.OneK_OneK),
    ];
    expect(selectUnofficialDefaultSequence(run, Model.DeepSeek_V4_Pro, Model.Kimi_K2_5)).toBe(
      Sequence.OneK_OneK,
    );
  });

  it('returns null when an explicitly pinned model is absent from the run', () => {
    const run = [entry(Model.DeepSeek_V4_Pro, Sequence.EightK_625)];
    expect(
      selectUnofficialDefaultSequence(run, Model.DeepSeek_V4_Pro, Model.DeepSeek_R1),
    ).toBeNull();
  });
});
