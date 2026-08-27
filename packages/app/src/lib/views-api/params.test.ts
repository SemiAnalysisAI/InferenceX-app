import { describe, expect, it } from 'vitest';

import { Sequence } from '@/lib/data-mappings';

import { ViewsApiParamError } from './errors';
import {
  parseBoolParam,
  parseDateParam,
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseListParam,
  parseMetricParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  resolveModelParam,
  VIEWS_MODEL_NAMES,
} from './params';

describe('resolveModelParam', () => {
  it('resolves a canonical display name', () => {
    const resolved = resolveModelParam('DeepSeek-V4-Pro');
    expect(resolved.displayName).toBe('DeepSeek-V4-Pro');
    expect(resolved.dbModelKeys.length).toBeGreaterThan(0);
  });

  it('is case-insensitive for display names', () => {
    expect(resolveModelParam('deepseek-v4-pro').displayName).toBe('DeepSeek-V4-Pro');
  });

  it('accepts compare-page slugs and aliases', () => {
    expect(resolveModelParam('deepseek-v4').displayName).toBe('DeepSeek-V4-Pro');
  });

  it('rejects unknown models with the allowed list', () => {
    try {
      resolveModelParam('not-a-model');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ViewsApiParamError);
      expect((error as ViewsApiParamError).param).toBe('model');
      expect((error as ViewsApiParamError).allowed).toEqual(VIEWS_MODEL_NAMES);
    }
  });

  it('requires a value', () => {
    expect(() => resolveModelParam(null)).toThrow(ViewsApiParamError);
  });
});

describe('parseSequenceParam', () => {
  it('accepts canonical and URL-segment forms', () => {
    expect(parseSequenceParam('8k/1k', Sequence.EightK_OneK)).toBe(Sequence.EightK_OneK);
    expect(parseSequenceParam('8k-1k', Sequence.EightK_OneK)).toBe(Sequence.EightK_OneK);
    expect(parseSequenceParam('agentic', Sequence.EightK_OneK)).toBe(Sequence.AgenticTraces);
    expect(parseSequenceParam('agentic_traces', Sequence.EightK_OneK)).toBe(Sequence.AgenticTraces);
  });

  it('falls back when absent and rejects unknown values', () => {
    expect(parseSequenceParam(null, Sequence.AgenticTraces)).toBe(Sequence.AgenticTraces);
    expect(() => parseSequenceParam('16k/1k', Sequence.EightK_OneK)).toThrow(ViewsApiParamError);
  });
});

describe('parseEnumParam / parseListParam', () => {
  it('matches case-insensitively and preserves canonical casing', () => {
    expect(parseEnumParam('P90', 'percentile', ['p75', 'p90'], 'p90')).toBe('p90');
  });

  it('throws with the allowed list on unknown values', () => {
    try {
      parseEnumParam('p50', 'percentile', ['p75', 'p90'], 'p90');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ViewsApiParamError).allowed).toEqual(['p75', 'p90']);
    }
  });

  it('canonicalizes lists: trim, dedupe, sort', () => {
    expect(parseListParam(' fp8, fp4 ,fp8', 'precisions', ['fp4', 'fp8', 'bf16'])).toEqual([
      'fp4',
      'fp8',
    ]);
  });

  it('parses free lists into sorted unique values', () => {
    expect(parseFreeListParam('b200_trt,gb200, b200_trt')).toEqual(['b200_trt', 'gb200']);
    expect(parseFreeListParam('B200_trt,GB200,b200_trt')).toEqual(['b200_trt', 'gb200']);
    expect(parseFreeListParam(null)).toEqual([]);
  });
});

describe('parsePrecisionsParam', () => {
  it('accepts known precisions and rejects unknown ones', () => {
    expect(parsePrecisionsParam('fp8,fp4')).toEqual(['fp4', 'fp8']);
    expect(() => parsePrecisionsParam('fp16')).toThrow(ViewsApiParamError);
  });
});

describe('parseBoolParam', () => {
  it('accepts 1/0/true/false and falls back when absent', () => {
    expect(parseBoolParam('1', 'optimal', false)).toBe(true);
    expect(parseBoolParam('false', 'optimal', true)).toBe(false);
    expect(parseBoolParam(null, 'optimal', true)).toBe(true);
    expect(() => parseBoolParam('yes', 'optimal', false)).toThrow(ViewsApiParamError);
  });
});

describe('parseNumberParam', () => {
  it('validates numeric bounds', () => {
    expect(parseNumberParam('42.5', 'target', 35)).toBe(42.5);
    expect(parseNumberParam(null, 'target', 35)).toBe(35);
    expect(() => parseNumberParam('abc', 'target', 35)).toThrow(ViewsApiParamError);
    expect(() => parseNumberParam('-1', 'target', 35, { min: 0 })).toThrow(ViewsApiParamError);
    expect(() => parseNumberParam('1.5', 'tier', 50, { integer: true })).toThrow(
      ViewsApiParamError,
    );
  });
});

describe('parseDateParam', () => {
  it('validates YYYY-MM-DD', () => {
    expect(parseDateParam('2026-08-01', 'date')).toBe('2026-08-01');
    expect(parseDateParam(null, 'date')).toBeUndefined();
    expect(() => parseDateParam('08/01/2026', 'date')).toThrow(ViewsApiParamError);
  });
});

describe('parseMetricParam', () => {
  it('accepts config keys, bare keys, and the legacy y alias', () => {
    expect(parseMetricParam('y_costh')).toBe('y_costh');
    expect(parseMetricParam('costh')).toBe('y_costh');
    expect(parseMetricParam('y')).toBe('y_tpPerGpu');
    expect(parseMetricParam(null)).toBe('y_tokensPerDollarN');
  });

  it('rejects unknown metrics instead of silently falling back', () => {
    expect(() => parseMetricParam('y_notAMetric')).toThrow(ViewsApiParamError);
    expect(() => parseMetricParam('notAMetric')).toThrow(ViewsApiParamError);
  });
});

describe('parseFormatParam', () => {
  it('defaults to json and accepts csv', () => {
    expect(parseFormatParam(null)).toBe('json');
    expect(parseFormatParam('csv')).toBe('csv');
    expect(() => parseFormatParam('xml')).toThrow(ViewsApiParamError);
  });
});
