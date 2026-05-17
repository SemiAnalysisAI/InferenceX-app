import { describe, expect, it } from 'vitest';

import type { EvaluationChartData } from '@/components/evaluation/types';
import { DRAWER_KEY_DELIMITER, findRowByDrawerKey, rowToDrawerKey } from './eval-drawer-key';

const BASE_ROW: EvaluationChartData = {
  evalResultId: 42,
  configId: 1,
  hwKey: 'mi355x_vllm' as any,
  hardware: 'mi355x',
  configLabel: 'MI355X (ATOM!) C32 T4 E1',
  score: 0.96,
  scoreError: 0.01,
  minScore: 0.95,
  maxScore: 0.97,
  errorMin: 0.95,
  errorMax: 0.97,
  model: 'DeepSeek-R1-0528',
  benchmark: 'gsm8k',
  specDecode: 'none',
  date: '2026-03-28',
  datetime: '2026-03-28T00:00:00Z',
  precision: 'fp4',
  framework: 'vllm',
  tp: 4,
  ep: 0,
  dp_attention: false,
  conc: 32,
  disagg: false,
  isMultinode: false,
  prefillTp: 4,
  prefillEp: 0,
  prefillDpAttention: false,
  prefillNumWorkers: 0,
  decodeNumWorkers: 0,
  numPrefillGpu: 0,
  numDecodeGpu: 0,
};

const UNOFFICIAL_ROW: EvaluationChartData = {
  ...BASE_ROW,
  evalResultId: -1,
  runUrl: 'https://github.com/owner/repo/actions/runs/12345678',
};

describe('rowToDrawerKey', () => {
  it('builds the expected composite key for an official row', () => {
    const key = rowToDrawerKey(BASE_ROW);
    expect(key).toBe('gsm8k~mi355x~fp4~vllm~none~0~32~4~');
  });

  it('includes the runId for an unofficial row', () => {
    const key = rowToDrawerKey(UNOFFICIAL_ROW);
    expect(key).toBe('gsm8k~mi355x~fp4~vllm~none~0~32~4~12345678');
  });

  it('encodes disagg=true as "1"', () => {
    const key = rowToDrawerKey({ ...BASE_ROW, disagg: true });
    expect(key).toContain(`${DRAWER_KEY_DELIMITER}1${DRAWER_KEY_DELIMITER}`);
  });

  it('produces different keys for rows that differ only in tp', () => {
    const key1 = rowToDrawerKey(BASE_ROW);
    const key2 = rowToDrawerKey({ ...BASE_ROW, tp: 8 });
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for rows that differ only in conc', () => {
    const key1 = rowToDrawerKey(BASE_ROW);
    const key2 = rowToDrawerKey({ ...BASE_ROW, conc: 256 });
    expect(key1).not.toBe(key2);
  });

  it('none of the built-in field values contain the delimiter', () => {
    const fields = [
      BASE_ROW.benchmark,
      BASE_ROW.hardware,
      BASE_ROW.precision,
      BASE_ROW.framework,
      BASE_ROW.specDecode,
      String(BASE_ROW.conc),
      String(BASE_ROW.tp),
    ];
    for (const f of fields) {
      expect(f).not.toContain(DRAWER_KEY_DELIMITER);
    }
  });
});

describe('findRowByDrawerKey', () => {
  const rows: EvaluationChartData[] = [
    BASE_ROW,
    { ...BASE_ROW, evalResultId: 99, tp: 8, conc: 256 },
    UNOFFICIAL_ROW,
  ];

  it('finds an official row by its composite key', () => {
    const key = rowToDrawerKey(BASE_ROW);
    expect(findRowByDrawerKey(rows, key)).toBe(BASE_ROW);
  });

  it('finds an unofficial row by its composite key', () => {
    const key = rowToDrawerKey(UNOFFICIAL_ROW);
    expect(findRowByDrawerKey(rows, key)).toBe(UNOFFICIAL_ROW);
  });

  it('returns null on a miss', () => {
    expect(findRowByDrawerKey(rows, 'nonexistent~key')).toBeNull();
  });

  it('returns null on an empty list', () => {
    expect(findRowByDrawerKey([], rowToDrawerKey(BASE_ROW))).toBeNull();
  });

  it('round-trips: key from row → find back same row', () => {
    for (const row of rows) {
      const key = rowToDrawerKey(row);
      expect(findRowByDrawerKey(rows, key)).toBe(row);
    }
  });
});
