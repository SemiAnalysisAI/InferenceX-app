import { describe, expect, it } from 'bun:test';

import { VENDOR_ORDER } from '@/components/inference/utils/quickFilters';
import { DEFAULT_TCO_BASIS } from '@/lib/catalog/constants';
import { Scenario } from '@/lib/catalog/data-mappings';
import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import { ViewsApiParamError } from './errors';
import {
  matchesHardware,
  FRAMEWORK_FAMILY_VALUES,
  MAX_RUN_ID_LIST,
  parseBoolParam,
  parseCostProviderParam,
  parseCostTypeParam,
  parseDateParam,
  parseDeploymentParam,
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseListParam,
  parseMetricParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseRunIdListParam,
  parseRunIdParam,
  parseScenarioParam,
  parseScenarioValue,
  parseTcoBasisParam,
  parseChipBasisParam,
  resolveModelParam,
  VENDOR_VALUES,
} from './params';
import { MODEL_DISPLAY_NAMES } from '@/lib/catalog/model-name-resolver';

describe('resolveModelParam', () => {
  it('resolves a canonical display name', () => {
    const resolved = resolveModelParam('DeepSeek-V4-Pro');
    expect(resolved.displayName).toBe('DeepSeek-V4-Pro');
    expect(resolved.dbModelKeys.length).toBeGreaterThan(0);
  });

  it('is case-insensitive for display names', () => {
    expect(resolveModelParam('deepseek-v4-pro').displayName).toBe('DeepSeek-V4-Pro');
  });

  it('accepts compare-page slugs, DB model keys, and legacy names', () => {
    expect(resolveModelParam('deepseek-v4').displayName).toBe('DeepSeek-V4-Pro');
    expect(resolveModelParam('dsv4').displayName).toBe('DeepSeek-V4-Pro');
    expect(resolveModelParam('Qwen3.5-397B-A17B').displayName).toBe('Qwen-3.5-397B-A17B');
    // Compare-page family aliases keep resolving here, as they always have on the views API.
    expect(resolveModelParam('deepseek').displayName).toBe('DeepSeek-R1-0528');
  });

  it('rejects unknown models with the allowed list', () => {
    try {
      resolveModelParam('not-a-model');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ViewsApiParamError);
      expect((error as ViewsApiParamError).param).toBe('model');
      expect((error as ViewsApiParamError).allowed).toEqual(MODEL_DISPLAY_NAMES);
    }
  });

  it('requires a value', () => {
    expect(() => resolveModelParam(null)).toThrow(ViewsApiParamError);
  });
});

describe('parseScenarioValue', () => {
  it.each([
    ['8k/1k', Scenario.EightK_OneK],
    ['8k-1k', Scenario.EightK_OneK],
    ['agentic', Scenario.AgenticTraces],
    ['agentic_traces', Scenario.AgenticTraces],
  ])('accepts canonical or URL-segment form %s', (value, expected) => {
    expect(parseScenarioValue(value, Scenario.OneK_OneK, 'scenario')).toBe(expected);
  });

  it('falls back when absent and rejects unknown values', () => {
    expect(parseScenarioValue(null, Scenario.AgenticTraces, 'scenario')).toBe(
      Scenario.AgenticTraces,
    );
    expect(() => parseScenarioValue('16k/1k', Scenario.EightK_OneK, 'scenario')).toThrow(
      ViewsApiParamError,
    );
  });

  it.each(['__proto__', 'constructor'])('rejects inherited scenario name %s', (value) => {
    expect(() => parseScenarioValue(value, Scenario.EightK_OneK, 'scenario')).toThrow(
      ViewsApiParamError,
    );
  });
});

const parseScenarioQuery = (query: string) =>
  parseScenarioParam(new URLSearchParams(query), Scenario.EightK_OneK);

const scenarioQueryError = (query: string) => {
  try {
    parseScenarioQuery(query);
  } catch (error) {
    return error as ViewsApiParamError;
  }
  throw new Error('expected a parameter error');
};

describe('parseScenarioParam', () => {
  it('reads scenario, and the older sequence parameter when scenario is absent', () => {
    expect(parseScenarioQuery('scenario=agentic')).toBe(Scenario.AgenticTraces);
    expect(parseScenarioQuery('sequence=agentic')).toBe(Scenario.AgenticTraces);
    expect(parseScenarioQuery('scenario=1k/1k&sequence=agentic')).toBe(Scenario.OneK_OneK);
    expect(parseScenarioQuery('model=x')).toBe(Scenario.EightK_OneK);
  });

  it('names the parameter the client sent when the value is unknown', () => {
    expect(scenarioQueryError('scenario=16k/1k')).toMatchObject({
      param: 'scenario',
      message: 'Unknown scenario: 16k/1k',
    });
    expect(scenarioQueryError('sequence=16k/1k')).toMatchObject({
      param: 'sequence',
      message: 'Unknown sequence: 16k/1k',
    });
  });
});

describe('parseEnumParam / parseListParam', () => {
  it('accepts the TokenSpeed family in public view filters', () => {
    expect(parseListParam('TokenSpeed', 'frameworks', FRAMEWORK_FAMILY_VALUES)).toEqual([
      'tokenspeed',
    ]);
  });

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
    expect(parseMetricParam(null)).toBe('y_tokensPerDollarH');
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

describe('parseRunIdParam / parseRunIdListParam', () => {
  it('accepts positive digit strings and treats empty as absent', () => {
    expect(parseRunIdParam('123')).toBe('123');
    expect(parseRunIdParam('')).toBeUndefined();
    expect(parseRunIdParam(null)).toBeUndefined();
  });

  it('rejects anything Number() would have coerced', () => {
    for (const value of ['0', '1e3', '0x10', '+5', '-1', '1.5', 'abc', ' 7']) {
      expect(() => parseRunIdParam(value, 'runId'), value).toThrow(ViewsApiParamError);
    }
  });

  it('trims, drops empties, and dedups a run list before the size limit', () => {
    expect(parseRunIdListParam(' 3, 1,,3 ', 'runs')).toEqual(['3', '1']);
    expect(parseRunIdListParam(null, 'runs')).toEqual([]);
    const nine = Array.from({ length: MAX_RUN_ID_LIST + 1 }, (_, i) => String(i + 1)).join(',');
    expect(() => parseRunIdListParam(nine, 'runs')).toThrow(ViewsApiParamError);
    expect(() => parseRunIdListParam('1,x', 'runs')).toThrow(ViewsApiParamError);
  });
});

describe('dashboard-derived allowlists', () => {
  it('exposes vendors in the dashboard pill order and covers the registry', () => {
    expect(VENDOR_VALUES).toEqual(VENDOR_ORDER);
    expect(new Set(VENDOR_VALUES)).toEqual(new Set(Object.values(GPU_VENDORS)));
  });

  it('expands the legacy agg alias like the dashboard and sorts', () => {
    expect(parseDeploymentParam('agg')).toEqual(['multi-node', 'single-node']);
    expect(parseDeploymentParam('disagg,single-node')).toEqual(['disagg', 'single-node']);
    expect(() => parseDeploymentParam('cluster')).toThrow(ViewsApiParamError);
  });

  it('defaults tcoBasis, cost provider, and cost type to the dashboard defaults', () => {
    expect(parseTcoBasisParam(null)).toBe(DEFAULT_TCO_BASIS);
    expect(parseTcoBasisParam('external')).toBe('external');
    expect(parseCostProviderParam(null)).toBe('costh');
    expect(parseCostTypeParam(null)).toBe('total');
    expect(() => parseCostTypeParam('gross')).toThrow(ViewsApiParamError);
  });

  it('defaults chipBasis to the stored per-pool basis and accepts total', () => {
    expect(parseChipBasisParam(null)).toBe('pool');
    expect(parseChipBasisParam('total')).toBe('total');
    expect(parseChipBasisParam('TOTAL')).toBe('total');
    expect(() => parseChipBasisParam('decode')).toThrow(ViewsApiParamError);
  });
});

describe('matchesHardware', () => {
  it('matches the full key or its base chip, case-insensitively, and passes when unfiltered', () => {
    expect(matchesHardware('B200_sglang', [])).toBe(true);
    expect(matchesHardware('B200_sglang', ['b200'])).toBe(true);
    expect(matchesHardware('B200_sglang', ['b200_sglang'])).toBe(true);
    expect(matchesHardware('B200_sglang', ['b200_vllm'])).toBe(false);
    expect(matchesHardware('mi355x', ['b200'])).toBe(false);
  });
});
