import { describe, it, expect } from 'vitest';

import {
  buildCanonicalHref,
  embedParamsToUrlState,
  EMBED_PARAM_DEFAULTS,
  readEmbedParams,
  resolveEmbedModel,
  resolveEmbedSequence,
  resolveEmbedYMetric,
} from '@/lib/embed-params';

describe('readEmbedParams', () => {
  it('returns defaults for empty input', () => {
    expect(readEmbedParams(new URLSearchParams())).toEqual(EMBED_PARAM_DEFAULTS);
  });

  it('returns defaults for null input', () => {
    expect(readEmbedParams(null)).toEqual(EMBED_PARAM_DEFAULTS);
  });

  it('reads model, isl, osl, precisions, gpus, y', () => {
    const sp = new URLSearchParams(
      'model=llama70b&isl=1024&osl=8192&precisions=fp8&gpus=h200_vllm,b200_sglang&y=costh',
    );
    expect(readEmbedParams(sp)).toEqual({
      model: 'llama70b',
      isl: '1024',
      osl: '8192',
      precisions: 'fp8',
      gpus: 'h200_vllm,b200_sglang',
      y: 'costh',
      chart: 'e2e',
    });
  });

  it('accepts chart=interactivity', () => {
    const sp = new URLSearchParams('chart=interactivity');
    expect(readEmbedParams(sp).chart).toBe('interactivity');
  });

  it('falls back to e2e for unknown chart values', () => {
    expect(readEmbedParams(new URLSearchParams('chart=bogus')).chart).toBe('e2e');
  });

  it('reads from plain object input', () => {
    expect(readEmbedParams({ model: 'dsv4', y: 'tpPerMw' })).toMatchObject({
      model: 'dsv4',
      y: 'tpPerMw',
    });
  });
});

describe('resolveEmbedYMetric', () => {
  it('maps short forms to internal y_* keys', () => {
    expect(resolveEmbedYMetric('tpPerGpu')).toBe('y_tpPerGpu');
    expect(resolveEmbedYMetric('costh')).toBe('y_costh');
    expect(resolveEmbedYMetric('tpPerMw')).toBe('y_tpPerMw');
  });

  it('passes through full y_* keys', () => {
    expect(resolveEmbedYMetric('y_costnOutput')).toBe('y_costnOutput');
  });

  it('falls back to default for unknown metrics', () => {
    expect(resolveEmbedYMetric('not_a_metric')).toBe('y_tpPerGpu');
    expect(resolveEmbedYMetric(null)).toBe('y_tpPerGpu');
  });
});

describe('resolveEmbedModel', () => {
  it('maps known DB keys to display names', () => {
    expect(resolveEmbedModel('dsr1')).toBe('DeepSeek-R1-0528');
    expect(resolveEmbedModel('llama70b')).toBe('Llama-3.3-70B-Instruct-FP8');
  });

  it('falls back to the default model for unknown keys', () => {
    expect(resolveEmbedModel('not-a-model')).toBe('DeepSeek-R1-0528');
  });
});

describe('resolveEmbedSequence', () => {
  it('maps known isl/osl pairs to sequence strings', () => {
    expect(resolveEmbedSequence('8192', '1024')).toBe('8k/1k');
    expect(resolveEmbedSequence('1024', '1024')).toBe('1k/1k');
    expect(resolveEmbedSequence('1024', '8192')).toBe('1k/8k');
  });

  it('falls back to default sequence for unknown pairs', () => {
    expect(resolveEmbedSequence('999', '999')).toBe('8k/1k');
    expect(resolveEmbedSequence('not-a-number', '1024')).toBe('8k/1k');
  });
});

describe('embedParamsToUrlState', () => {
  it('translates defaults to the matching url-state shape', () => {
    expect(embedParamsToUrlState(EMBED_PARAM_DEFAULTS)).toEqual({
      g_model: 'DeepSeek-R1-0528',
      i_seq: '8k/1k',
      i_prec: 'fp4',
      i_metric: 'y_tpPerGpu',
    });
  });

  it('includes i_active when gpus are specified', () => {
    const params = readEmbedParams(new URLSearchParams('gpus=b300_sglang,gb300_dynamo-sglang'));
    expect(embedParamsToUrlState(params).i_active).toBe('b300_sglang,gb300_dynamo-sglang');
  });

  it('omits i_active when no gpus are specified', () => {
    expect(embedParamsToUrlState(EMBED_PARAM_DEFAULTS).i_active).toBeUndefined();
  });
});

describe('buildCanonicalHref', () => {
  it('points to /inference and round-trips the embed state', () => {
    const params = readEmbedParams(
      new URLSearchParams('model=dsv4&isl=1024&osl=1024&precisions=fp4&gpus=b200_vllm&y=costh'),
    );
    const href = buildCanonicalHref(params, 'https://inferencex.semianalysis.com');
    expect(href).toContain('https://inferencex.semianalysis.com/inference?');
    expect(href).toContain('g_model=DeepSeek-V4-Pro');
    expect(href).toContain('i_seq=1k%2F1k');
    expect(href).toContain('i_prec=fp4');
    expect(href).toContain('i_metric=y_costh');
    expect(href).toContain('i_active=b200_vllm');
  });

  it('omits i_active when no gpus are specified', () => {
    const href = buildCanonicalHref(EMBED_PARAM_DEFAULTS, 'https://example.com');
    expect(href).not.toContain('i_active');
  });
});
