import { describe, expect, it } from 'vitest';

import {
  getChartTitleZh,
  resolveCalculatorBarSelection,
  resolveCalculatorTarget,
  resolveCalculatorTargetInputValue,
  resolveCalculatorVisibility,
} from '@/components/calculator/ThroughputCalculatorDisplay';

describe('calculator Chinese chart titles', () => {
  it('describes power efficiency as token throughput per all-in provisioned megawatt', () => {
    expect(
      getChartTitleZh('power', 'interactivity_to_throughput', 25, 'input', undefined, 'p90'),
    ).toBe('25 tok/s/user P90 交互性下每全电源配置兆瓦输入 token 吞吐量');
  });
});

describe('calculator effective state selectors', () => {
  it('starts a new data scope with every available GPU visible', () => {
    expect(resolveCalculatorVisibility(null, 'scope-b', ['h100', 'b200'])).toEqual(
      new Set(['h100', 'b200']),
    );
    expect(
      resolveCalculatorVisibility(
        { scopeKey: 'scope-a', visible: new Set(['h100']), known: new Set(['h100']) },
        'scope-b',
        ['b200'],
      ),
    ).toEqual(new Set(['b200']));
  });

  it('adds late overlay GPUs while retaining visibility intent for known GPUs', () => {
    const intent = {
      scopeKey: 'scope',
      visible: new Set(['h100']),
      known: new Set(['h100', 'b200']),
    };
    expect(resolveCalculatorVisibility(intent, 'scope', ['h100', 'b200', 'overlay'])).toEqual(
      new Set(['h100', 'overlay']),
    );
  });

  it('drops departed GPUs and never leaves an available chart empty', () => {
    const intent = {
      scopeKey: 'scope',
      visible: new Set(['departed']),
      known: new Set(['departed', 'h100']),
    };
    expect(resolveCalculatorVisibility(intent, 'scope', ['h100'])).toEqual(new Set(['h100']));
  });

  it('keeps requested target intent while deriving a clamped effective target', () => {
    expect(resolveCalculatorTarget(35, false, { min: 50, max: 100 })).toBe(35);
    expect(resolveCalculatorTarget(35, true, { min: 50, max: 100 })).toBe(50);
    expect(resolveCalculatorTarget(120, true, { min: 50, max: 100 })).toBe(100);
  });

  it('shows the effective clamp when idle while preserving the active editing buffer', () => {
    expect(resolveCalculatorTargetInputValue('100', 80, false)).toBe('80');
    expect(resolveCalculatorTargetInputValue('100', 80, true)).toBe('100');
  });

  it('clears stale bar selections when results change and prunes missing IDs', () => {
    const intent = { resultsKey: 'old', selected: new Set(['a', 'b']) };
    expect(resolveCalculatorBarSelection(intent, 'new', new Set(['a', 'b']))).toEqual(new Set());
    expect(resolveCalculatorBarSelection(intent, 'old', new Set(['b']))).toEqual(new Set(['b']));
  });
});
