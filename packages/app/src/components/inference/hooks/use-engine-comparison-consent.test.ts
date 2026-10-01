// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { Model, Sequence } from '@/lib/data-mappings';
import { comparisonExclusion } from '../utils/comparison-exclusion';
import {
  needsEngineComparisonConsent,
  supportsEngineComparisonConsent,
  useEngineComparisonConsent,
} from './use-engine-comparison-consent';

describe('same-SKU engine consent', () => {
  const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false);

  it.each([
    [['b200_vllm', 'b200_sglang'], true],
    [['b200_vllm', 'b300_sglang'], false],
    [['b200_vllm', 'b200_dynamo-vllm'], false],
    [['b200_mori-sglang', 'b200_dynamo-vllm'], true],
    [['b200_sglang_mtp', 'b200_vllm'], true],
    [['b200_atom', 'b200_vllm', 'b200_trt'], false],
    [[], false],
  ] as const)('checks %j without confusing hardware or engine wrappers', (keys, expected) => {
    expect(needsEngineComparisonConsent(keys, exclusion)).toBe(expected);
  });

  it('does not prompt for unrestricted/unofficial views or unrelated fixed-seq MTP rules', () => {
    expect(needsEngineComparisonConsent(['b200_vllm', 'b200_sglang'], null)).toBe(false);
    expect(supportsEngineComparisonConsent(Sequence.OneK_OneK)).toBe(false);
    expect(supportsEngineComparisonConsent(Sequence.OneK_EightK)).toBe(false);
    expect(supportsEngineComparisonConsent(Sequence.EightK_OneK)).toBe(true);
    expect(supportsEngineComparisonConsent(Sequence.AgenticTraces)).toBe(true);
  });

  it('applies only on confirmation, discards cancelled work and resets on scope changes', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    let consent!: ReturnType<typeof useEngineComparisonConsent>;
    function Harness({ scope }: { scope: string }) {
      consent = useEngineComparisonConsent(scope);
      return null;
    }
    const render = (scope: string) => act(() => root.render(createElement(Harness, { scope })));
    const apply = vi.fn();
    try {
      render('dsv4|agentic|fp4');
      act(() => consent.request(apply));
      expect(consent.open).toBe(true);
      expect(consent.accepted).toBe(false);
      expect(apply).not.toHaveBeenCalled();
      act(() => consent.cancel());
      act(() => consent.confirm());
      expect(apply).not.toHaveBeenCalled();
      expect(consent.open).toBe(false);
      act(() => consent.request(apply));
      act(() => consent.confirm());
      expect(apply).toHaveBeenCalledTimes(1);
      expect(consent.accepted).toBe(true);
      expect(consent.open).toBe(false);
      render('qwen|8k1k|fp8');
      expect(consent.accepted).toBe(false);
      render('dsv4|agentic|fp4');
      expect(consent.accepted).toBe(false);
      act(() => consent.request(apply));
      render('dsv4|agentic|fp8');
      act(() => consent.confirm());
      expect(apply).toHaveBeenCalledTimes(1);
      expect(consent.open).toBe(false);
    } finally {
      act(() => root.unmount());
    }
  });
});
