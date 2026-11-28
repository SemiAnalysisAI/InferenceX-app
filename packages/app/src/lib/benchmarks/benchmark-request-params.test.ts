import { describe, expect, it } from 'bun:test';

import { MODEL_DISPLAY_NAMES } from '@/lib/catalog/model-name-resolver';

import {
  isCalendarDate,
  parseBenchmarkRequest,
  UNKNOWN_MODEL_DETAIL,
} from './benchmark-request-params';

describe('isCalendarDate', () => {
  it.each(['2026-11-03', '2000-02-29', '2028-02-29', '0001-01-01', '9999-12-31'])(
    'accepts %s',
    (value) => expect(isCalendarDate(value)).toBe(true),
  );

  it.each([
    'latest',
    '313296699',
    '2026-11-3',
    '2026-11-03T00:00:00Z',
    ' 2026-11-03',
    '1900-02-29',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '0000-01-01',
  ])('rejects %s', (value) => expect(isCalendarDate(value)).toBe(false));
});

const parse = (query: string) => parseBenchmarkRequest(new URLSearchParams(query));

describe('parseBenchmarkRequest', () => {
  it('resolves defaults for a model-only request', () => {
    expect(parse('model=DeepSeek-R1-0528')).toEqual({
      ok: true,
      params: {
        dbModelKeys: ['dsr1'],
        date: undefined,
        exact: false,
        runId: undefined,
        exactRun: false,
        view: undefined,
        scenario: '',
        powerValid: null,
      },
    });
  });

  it('drops the scenario outside the calculator view', () => {
    const result = parse('model=DeepSeek-R1-0528&scenario=1k%2F1k');
    expect(result.ok && result.params.scenario).toBe('');
  });

  it('keeps the calculator scenario and an exact run selection', () => {
    expect(parse('model=DeepSeek-R1-0528&view=calculator&scenario=8k%2F1k')).toMatchObject({
      ok: true,
      params: { view: 'calculator', scenario: '8k/1k' },
    });
    expect(parse('model=DeepSeek-R1-0528&runId=27489075807&exactRun=true')).toMatchObject({
      ok: true,
      params: { runId: '27489075807', exactRun: true },
    });
  });

  it('still reads the calculator scenario from the older sequence parameter', () => {
    expect(parse('model=DeepSeek-R1-0528&view=calculator&sequence=8k%2F1k')).toMatchObject({
      ok: true,
      params: { view: 'calculator', scenario: '8k/1k' },
    });
    expect(
      parse('model=DeepSeek-R1-0528&view=calculator&scenario=agentic-traces&sequence=8k%2F1k'),
    ).toMatchObject({ ok: true, params: { scenario: 'agentic-traces' } });
  });

  it('rejects a calculator view without a known scenario, naming the parameter sent', () => {
    expect(parse('model=DeepSeek-R1-0528&view=calculator')).toEqual({
      ok: false,
      error: 'Unknown calculator scenario',
    });
    expect(parse('model=DeepSeek-R1-0528&view=calculator&scenario=16k%2F1k')).toEqual({
      ok: false,
      error: 'Unknown calculator scenario',
    });
    expect(parse('model=DeepSeek-R1-0528&view=calculator&sequence=16k%2F1k')).toEqual({
      ok: false,
      error: 'Unknown calculator sequence',
    });
  });

  it('reports the model before any other malformed parameter, with the accepted names', () => {
    expect(parse('model=nope&date=bad')).toEqual({
      ok: false,
      error: 'Unknown model',
      detail: UNKNOWN_MODEL_DETAIL,
    });
    expect(UNKNOWN_MODEL_DETAIL).toEqual({ param: 'model', allowed: MODEL_DISPLAY_NAMES });
  });

  it('accepts the model forms the views API accepts', () => {
    expect(parse('model=kimik3.1')).toMatchObject({
      ok: true,
      params: { dbModelKeys: ['kimik3.1'] },
    });
    expect(parse('model=GLM-5.3')).toMatchObject({
      ok: true,
      params: { dbModelKeys: ['glm5.2', 'glm5.3'] },
    });
  });
});
