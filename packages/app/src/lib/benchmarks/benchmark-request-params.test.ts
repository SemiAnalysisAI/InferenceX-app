import { describe, expect, it } from 'vitest';

import { isCalendarDate, parseBenchmarkRequest } from './benchmark-request-params';

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
        sequence: '',
        powerValid: null,
      },
    });
  });

  it('drops sequence outside the calculator view', () => {
    const result = parse('model=DeepSeek-R1-0528&sequence=1k%2F1k');
    expect(result.ok && result.params.sequence).toBe('');
  });

  it('keeps the calculator sequence and an exact run selection', () => {
    expect(parse('model=DeepSeek-R1-0528&view=calculator&sequence=8k%2F1k')).toMatchObject({
      ok: true,
      params: { view: 'calculator', sequence: '8k/1k' },
    });
    expect(parse('model=DeepSeek-R1-0528&runId=27489075807&exactRun=true')).toMatchObject({
      ok: true,
      params: { runId: '27489075807', exactRun: true },
    });
  });

  it('rejects a calculator view without a sequence', () => {
    expect(parse('model=DeepSeek-R1-0528&view=calculator')).toEqual({
      ok: false,
      error: 'Unknown calculator sequence',
    });
  });

  it('reports the model before any other malformed parameter', () => {
    expect(parse('model=nope&date=bad')).toEqual({ ok: false, error: 'Unknown model' });
  });
});
