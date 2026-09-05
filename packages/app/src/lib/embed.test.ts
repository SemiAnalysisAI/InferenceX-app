import { describe, expect, it } from 'vitest';

import { Sequence } from './data-mappings';
import {
  EMBED_DEFAULT_Y_AXIS_METRIC,
  EMBED_RESIZE_MESSAGE_TYPE,
  isEmbedPathname,
  isEmbedResizeMessage,
  parseEmbedOptions,
  parseEmbedTheme,
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
      yAxisMetric: 'y_tpPerGpu',
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
    expect(parseEmbedOptions({ theme: 'light' }).skin).toBeUndefined();
  });

  it('splits a skinned theme into base theme + skin', () => {
    expect(parseEmbedOptions({ theme: 'vllm-light' })).toMatchObject({
      theme: 'light',
      skin: 'vllm',
    });
    expect(parseEmbedOptions({ theme: 'VLLM-Dark' })).toMatchObject({
      theme: 'dark',
      skin: 'vllm',
    });
    // Unknown skin prefix: keep the base theme, drop the skin.
    expect(parseEmbedOptions({ theme: 'sglang-light' })).toMatchObject({
      theme: 'light',
      skin: undefined,
    });
    // Standalone skin= is also accepted; theme= prefix wins when both are set.
    expect(parseEmbedOptions({ skin: 'vllm' })).toMatchObject({ theme: 'dark', skin: 'vllm' });
    expect(parseEmbedOptions({ skin: 'nope', theme: 'light' }).skin).toBeUndefined();
  });

  it('parseEmbedTheme handles empty and malformed input', () => {
    expect(parseEmbedTheme(undefined)).toEqual({ theme: 'dark', skin: undefined });
    expect(parseEmbedTheme('-')).toEqual({ theme: 'dark', skin: undefined });
    expect(parseEmbedTheme('vllm-')).toEqual({ theme: 'dark', skin: 'vllm' });
  });

  it('resolves scenario path segments and raw sequence keys', () => {
    expect(parseEmbedOptions({ scenario: 'agentic' }).sequence).toBe(Sequence.AgenticTraces);
    expect(parseEmbedOptions({ scenario: '8k-1k' }).sequence).toBe(Sequence.EightK_OneK);
    expect(parseEmbedOptions({ i_seq: '1k/8k' }).sequence).toBe(Sequence.OneK_EightK);
    expect(parseEmbedOptions({ scenario: 'bogus' }).sequence).toBeUndefined();
  });

  it('defaults the y-axis to total throughput per chip', () => {
    expect(EMBED_DEFAULT_Y_AXIS_METRIC).toBe('y_tpPerGpu');
    expect(parseEmbedOptions({}).yAxisMetric).toBe('y_tpPerGpu');
  });

  it('accepts known y-axis metrics only', () => {
    expect(parseEmbedOptions({ metric: 'y_tokensPerDollarH' }).yAxisMetric).toBe(
      'y_tokensPerDollarH',
    );
    expect(parseEmbedOptions({ metric: 'y' }).yAxisMetric).toBe('y');
    expect(parseEmbedOptions({ metric: 'y_madeUp' }).yAxisMetric).toBe('y_tpPerGpu');
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
