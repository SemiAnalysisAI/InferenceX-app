import { describe, expect, it } from 'vitest';

import type { AvailableModelSequence } from '@/components/unofficial-run-provider';
import { Model, Sequence } from '@/lib/data-mappings';

import {
  computeAutoAddPrecisionDecision,
  computeAutoSwitchDecision,
} from './unofficial-run-auto-switch';

function entry(
  model: Model,
  sequence: Sequence,
  precisions: string[] = [],
): AvailableModelSequence {
  return { model, sequence, precisions };
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

describe('computeAutoAddPrecisionDecision', () => {
  it('returns no-op and resets the key when no unofficial run is loaded', () => {
    expect(
      computeAutoAddPrecisionDecision(
        [],
        undefined,
        ['fp4'],
        Model.DeepSeek_R1,
        Sequence.EightK_OneK,
        'stale-key',
      ),
    ).toEqual({ nextKey: '', precisionToAdd: null });
  });

  it('adds the run precision when the user filter does not intersect it (ATOM/MTP case)', () => {
    // Regression for issue #412: an ATOM/MTP run is fp8-only, default i_prec is fp4,
    // so the overlay points are silently filtered out by ScatterGraph.
    const run = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['fp8'])];
    const decision = computeAutoAddPrecisionDecision(
      run,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      '',
    );
    expect(decision.precisionToAdd).toBe('fp8');
    expect(decision.nextKey).toBe(`${Model.DeepSeek_R1}|${Sequence.EightK_OneK}|fp8`);
  });

  it('respects an explicit i_prec URL pin without advancing the dedupe key', () => {
    const run = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['fp8'])];
    const decision = computeAutoAddPrecisionDecision(
      run,
      'fp4',
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      '',
    );
    expect(decision.precisionToAdd).toBeNull();
    // Ref must NOT be advanced — if the URL pin is later removed we still want
    // the auto-add to fire on the same overlay set.
    expect(decision.nextKey).toBe('');
  });

  it('does nothing when the user already has at least one run precision selected', () => {
    const run = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['fp4', 'fp8'])];
    const decision = computeAutoAddPrecisionDecision(
      run,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      '',
    );
    expect(decision.precisionToAdd).toBeNull();
    // Key still advances so we don't keep re-evaluating on every render.
    expect(decision.nextKey).toBe(`${Model.DeepSeek_R1}|${Sequence.EightK_OneK}|fp4,fp8`);
  });

  it('does nothing when the run has no precisions for the current model+sequence', () => {
    // Overlay is for a different model — auto-add must not pick precisions
    // from an unrelated entry. (e.g. multi-run overlay where the user has
    // navigated to a model only some runs cover.)
    const run = [entry(Model.Kimi_K2_5, Sequence.EightK_OneK, ['fp8'])];
    const decision = computeAutoAddPrecisionDecision(
      run,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      'prev-key',
    );
    expect(decision.precisionToAdd).toBeNull();
    expect(decision.nextKey).toBe('prev-key');
  });

  it('does not re-fire after the user removes the auto-added precision', () => {
    // Simulate the post-auto-add state: ref already holds the run's key,
    // user manually removed fp8 from their selection. We must NOT re-add it.
    const run = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['fp8'])];
    const lastKey = `${Model.DeepSeek_R1}|${Sequence.EightK_OneK}|fp8`;
    const decision = computeAutoAddPrecisionDecision(
      run,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      lastKey,
    );
    expect(decision.precisionToAdd).toBeNull();
    expect(decision.nextKey).toBe(lastKey);
  });

  it('re-arms after the overlay set is cleared so a subsequent load can add again', () => {
    // Step 1: a run loads, fp8 auto-added.
    const run = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['fp8'])];
    const first = computeAutoAddPrecisionDecision(
      run,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      '',
    );
    expect(first.precisionToAdd).toBe('fp8');

    // Step 2: user dismisses the run, overlay set goes empty — ref resets.
    const cleared = computeAutoAddPrecisionDecision(
      [],
      undefined,
      ['fp4', 'fp8'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      first.nextKey,
    );
    expect(cleared).toEqual({ nextKey: '', precisionToAdd: null });

    // Step 3: a new run loads with a precision still not in the user's filter.
    const run2 = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['bf16'])];
    const second = computeAutoAddPrecisionDecision(
      run2,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      cleared.nextKey,
    );
    expect(second.precisionToAdd).toBe('bf16');
  });

  it('picks the first precision deterministically when the run has multiple', () => {
    // Same set of precisions in two different orders should auto-add the same
    // target. `parseAvailableModelsAndSequences` builds precisions from a
    // `Set`, so insertion order is not guaranteed across renders.
    const orderA = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['fp8', 'bf16', 'int4'])];
    const orderB = [entry(Model.DeepSeek_R1, Sequence.EightK_OneK, ['int4', 'fp8', 'bf16'])];
    const a = computeAutoAddPrecisionDecision(
      orderA,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      '',
    );
    const b = computeAutoAddPrecisionDecision(
      orderB,
      undefined,
      ['fp4'],
      Model.DeepSeek_R1,
      Sequence.EightK_OneK,
      '',
    );
    expect(a.precisionToAdd).toBe(b.precisionToAdd);
    expect(a.nextKey).toBe(b.nextKey);
  });
});
