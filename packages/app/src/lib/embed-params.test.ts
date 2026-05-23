import { describe, it, expect } from 'vitest';

import {
  buildCanonicalHref,
  buildEmbedIframeSnippet,
  buildEmbedScatterUrl,
  readEmbedChartVariant,
} from '@/lib/embed-params';

describe('readEmbedChartVariant', () => {
  it('returns e2e by default (absent/null)', () => {
    expect(readEmbedChartVariant(null)).toBe('e2e');
    expect(readEmbedChartVariant(undefined)).toBe('e2e');
    expect(readEmbedChartVariant('')).toBe('e2e');
  });

  it('returns interactivity for exact match', () => {
    expect(readEmbedChartVariant('interactivity')).toBe('interactivity');
  });

  it('falls back to e2e for unknown values', () => {
    expect(readEmbedChartVariant('bogus')).toBe('e2e');
    expect(readEmbedChartVariant('e2e')).toBe('e2e');
  });
});

describe('buildEmbedScatterUrl', () => {
  it('emits site-style parameter keys', () => {
    const url = buildEmbedScatterUrl({
      origin: 'https://inferencex.example.com',
      model: 'DeepSeek-R1-0528',
      sequence: '8k/1k',
      precisions: 'fp4',
      yMetric: 'y_tpPerGpu',
      activeGpus: '',
      chartType: 'e2e',
    });
    expect(url).toMatch(/^https:\/\/inferencex\.example\.com\/embed\/scatter\?/u);
    const sp = new URL(url).searchParams;
    expect(sp.get('g_model')).toBe('DeepSeek-R1-0528');
    expect(sp.get('i_seq')).toBe('8k/1k');
    expect(sp.get('i_prec')).toBe('fp4');
    expect(sp.get('i_metric')).toBe('y_tpPerGpu');
    expect(sp.has('i_active')).toBe(false);
    expect(sp.has('i_chart')).toBe(false);
  });

  it('omits i_chart for e2e (default)', () => {
    const url = buildEmbedScatterUrl({
      origin: 'https://example.com',
      model: 'DeepSeek-V4-Pro',
      sequence: '1k/1k',
      precisions: 'fp4',
      yMetric: 'y_costh',
      activeGpus: '',
      chartType: 'e2e',
    });
    expect(new URL(url).searchParams.has('i_chart')).toBe(false);
  });

  it('includes i_chart=interactivity when chart type is interactivity', () => {
    const url = buildEmbedScatterUrl({
      origin: 'https://example.com',
      model: 'DeepSeek-V4-Pro',
      sequence: '1k/1k',
      precisions: 'fp4',
      yMetric: 'y_costh',
      activeGpus: '',
      chartType: 'interactivity',
    });
    expect(new URL(url).searchParams.get('i_chart')).toBe('interactivity');
  });

  it('includes i_active when activeGpus is set', () => {
    const url = buildEmbedScatterUrl({
      origin: 'https://example.com',
      model: 'DeepSeek-R1-0528',
      sequence: '8k/1k',
      precisions: 'fp4',
      yMetric: 'y_tpPerGpu',
      activeGpus: 'b200_sglang,gb300_dynamo-sglang',
      chartType: 'e2e',
    });
    expect(new URL(url).searchParams.get('i_active')).toBe('b200_sglang,gb300_dynamo-sglang');
  });

  it('falls back to fp4 when precisions is empty', () => {
    const url = buildEmbedScatterUrl({
      origin: 'https://example.com',
      model: 'DeepSeek-R1-0528',
      sequence: '8k/1k',
      precisions: '',
      yMetric: 'y_tpPerGpu',
      activeGpus: '',
      chartType: 'e2e',
    });
    expect(new URL(url).searchParams.get('i_prec')).toBe('fp4');
  });

  it('the produced URL can be loaded by seedUrlState (site-key passthrough)', () => {
    const url = buildEmbedScatterUrl({
      origin: 'https://inferencex.semianalysis.com',
      model: 'Llama-3.3-70B-Instruct-FP8',
      sequence: '1k/8k',
      precisions: 'fp8',
      yMetric: 'y_costh',
      activeGpus: 'b200_vllm',
      chartType: 'interactivity',
    });
    const sp = new URL(url).searchParams;
    // All keys are directly usable as UrlStateParams — no further translation required.
    expect(sp.get('g_model')).toBe('Llama-3.3-70B-Instruct-FP8');
    expect(sp.get('i_seq')).toBe('1k/8k');
    expect(sp.get('i_prec')).toBe('fp8');
    expect(sp.get('i_metric')).toBe('y_costh');
    expect(sp.get('i_active')).toBe('b200_vllm');
    expect(sp.get('i_chart')).toBe('interactivity');
  });
});

describe('buildCanonicalHref', () => {
  it('points to /inference and drops i_chart', () => {
    const href = buildCanonicalHref(
      {
        g_model: 'DeepSeek-V4-Pro',
        i_seq: '1k/1k',
        i_prec: 'fp4',
        i_metric: 'y_costh',
        i_active: 'b200_vllm',
        i_chart: 'interactivity',
      } as any,
      'https://inferencex.semianalysis.com',
    );
    expect(href).toContain('https://inferencex.semianalysis.com/inference?');
    expect(href).toContain('g_model=DeepSeek-V4-Pro');
    expect(href).toContain('i_seq=1k%2F1k');
    expect(href).toContain('i_prec=fp4');
    expect(href).toContain('i_metric=y_costh');
    expect(href).toContain('i_active=b200_vllm');
    expect(href).not.toContain('i_chart');
  });

  it('applies defaults for the four core params when the embed URL has no query string', () => {
    // A bare /embed/scatter URL passes an empty params object.
    // The canonical href must still include the core params so the link works.
    const href = buildCanonicalHref({}, 'https://example.com');
    expect(href).toContain('g_model=DeepSeek-R1-0528');
    expect(href).toContain('i_seq=8k%2F1k');
    expect(href).toContain('i_prec=fp4');
    expect(href).toContain('i_metric=y_tpPerGpu');
    expect(href).not.toContain('i_active');
  });

  it('omits i_active when not set', () => {
    const href = buildCanonicalHref(
      { g_model: 'DeepSeek-R1-0528', i_seq: '8k/1k', i_prec: 'fp4', i_metric: 'y_tpPerGpu' },
      'https://example.com',
    );
    expect(href).not.toContain('i_active');
  });
});

describe('buildEmbedIframeSnippet', () => {
  it('wraps the embed URL in a recommended iframe tag', () => {
    const url = 'https://example.com/embed/scatter?g_model=DeepSeek-R1-0528';
    const snippet = buildEmbedIframeSnippet(url);
    expect(snippet).toContain(`src="${url}"`);
    expect(snippet).toContain('width="800"');
    expect(snippet).toContain('height="500"');
    expect(snippet).toContain('loading="lazy"');
    expect(snippet).toContain('referrerpolicy="origin"');
    expect(snippet).toContain('allow="clipboard-write"');
  });

  it('accepts custom width and height', () => {
    const snippet = buildEmbedIframeSnippet('https://x.test/e', { width: '100%', height: 400 });
    expect(snippet).toContain('width="100%"');
    expect(snippet).toContain('height="400"');
  });
});
