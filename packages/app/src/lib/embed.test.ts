import { describe, expect, it } from 'vitest';

import { Sequence } from './data-mappings';
import {
  EMBED_RESIZE_MESSAGE_TYPE,
  isEmbedPathname,
  isEmbedResizeMessage,
  parseEmbedOptions,
} from './embed';

describe('isEmbedPathname', () => {
  it('matches the English and Chinese embed trees only', () => {
    expect(isEmbedPathname('/embed/model/deepseek-v4')).toBe(true);
    expect(isEmbedPathname('/zh/embed/model/deepseek-v4')).toBe(true);
    expect(isEmbedPathname('/model/deepseek-v4')).toBe(false);
    expect(isEmbedPathname('/embedded')).toBe(false);
    expect(isEmbedPathname('/')).toBe(false);
    expect(isEmbedPathname(null)).toBe(false);
    expect(isEmbedPathname(undefined)).toBe(false);
  });
});

describe('parseEmbedOptions', () => {
  it('defaults to an unlocked dark chart on the featured scenario', () => {
    expect(parseEmbedOptions({})).toEqual({
      frameworks: [],
      theme: 'dark',
      sequence: undefined,
      yAxisMetric: undefined,
    });
  });

  it('locks to the requested framework families and drops unknown ones', () => {
    // The lock is what keeps a vLLM-hosted embed from ever plotting another
    // engine, so unknown keys must not silently widen it.
    expect(parseEmbedOptions({ framework: 'vllm' }).frameworks).toEqual(['vllm']);
    expect(parseEmbedOptions({ framework: 'VLLM, sglang' }).frameworks).toEqual(['vllm', 'sglang']);
    expect(parseEmbedOptions({ framework: 'vllm,vllm,nope' }).frameworks).toEqual(['vllm']);
    expect(parseEmbedOptions({ framework: 'nope' }).frameworks).toEqual([]);
    expect(parseEmbedOptions({ fw: 'trt' }).frameworks).toEqual(['trt']);
  });

  it('takes the first value of a repeated query key', () => {
    expect(parseEmbedOptions({ framework: ['vllm', 'sglang'] }).frameworks).toEqual(['vllm']);
  });

  it('accepts light or dark and falls back to dark', () => {
    expect(parseEmbedOptions({ theme: 'light' }).theme).toBe('light');
    expect(parseEmbedOptions({ theme: 'Dark' }).theme).toBe('dark');
    expect(parseEmbedOptions({ theme: 'minecraft' }).theme).toBe('dark');
  });

  it('resolves scenario path segments and raw sequence keys', () => {
    expect(parseEmbedOptions({ scenario: 'agentic' }).sequence).toBe(Sequence.AgenticTraces);
    expect(parseEmbedOptions({ scenario: '8k-1k' }).sequence).toBe(Sequence.EightK_OneK);
    expect(parseEmbedOptions({ i_seq: '1k/8k' }).sequence).toBe(Sequence.OneK_EightK);
    expect(parseEmbedOptions({ scenario: 'bogus' }).sequence).toBeUndefined();
  });

  it('accepts known y-axis metrics only', () => {
    expect(parseEmbedOptions({ metric: 'y_tokensPerDollarH' }).yAxisMetric).toBe(
      'y_tokensPerDollarH',
    );
    expect(parseEmbedOptions({ metric: 'y' }).yAxisMetric).toBe('y');
    expect(parseEmbedOptions({ metric: 'y_madeUp' }).yAxisMetric).toBeUndefined();
  });
});

describe('isEmbedResizeMessage', () => {
  it('accepts only the resize shape with a finite height', () => {
    expect(isEmbedResizeMessage({ type: EMBED_RESIZE_MESSAGE_TYPE, height: 640 })).toBe(true);
    expect(isEmbedResizeMessage({ type: EMBED_RESIZE_MESSAGE_TYPE, height: Number.NaN })).toBe(
      false,
    );
    expect(isEmbedResizeMessage({ type: 'other', height: 640 })).toBe(false);
    expect(isEmbedResizeMessage(null)).toBe(false);
    expect(isEmbedResizeMessage('inferencex:embed-resize')).toBe(false);
  });
});
