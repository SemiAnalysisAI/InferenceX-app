import { describe, expect, it } from 'vitest';

import { buildTokenLengthSketch } from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import { STATS_VERSION } from './agentic-shared';
import { getResidentSequenceLengthSketches } from './resident-sequence-lengths.js';

function mockSql(rows: unknown[]): DbClient {
  return (() => Promise.resolve(rows)) as unknown as DbClient;
}

describe('getResidentSequenceLengthSketches', () => {
  it('merges current sketches and omits stale rows without a blob fallback', async () => {
    const result = await getResidentSequenceLengthSketches(
      mockSql([
        {
          benchmark_result_id: 1,
          stats: {
            version: STATS_VERSION,
            sequenceLengths: {
              isl: buildTokenLengthSketch([10, 20]),
              osl: buildTokenLengthSketch([1, 2]),
            },
          },
        },
        {
          benchmark_result_id: 2,
          stats: {
            version: STATS_VERSION,
            sequenceLengths: {
              isl: buildTokenLengthSketch([1_000]),
              osl: buildTokenLengthSketch([100]),
            },
          },
        },
        { benchmark_result_id: 3, stats: { version: STATS_VERSION - 1 } },
      ]),
      [1, 2, 3],
    );

    expect(result.coveredPoints).toBe(2);
    expect(result.requestedPoints).toBe(3);
    expect(result.isl?.n).toBe(3);
    expect(result.osl?.n).toBe(3);
  });
});
