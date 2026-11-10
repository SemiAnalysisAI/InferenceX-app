import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildTokenLengthSketch,
  mergeTokenLengthSketches,
} from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import { STATS_VERSION, sequenceLengthSketchColumns } from './agentic-shared';
import {
  getResidentSequenceLengthSketches,
  mergeResidentSequenceLengthSketches,
} from './resident-sequence-lengths.js';

const A = { isl: buildTokenLengthSketch([10, 20, 0]), osl: buildTokenLengthSketch([1, 2]) };
const B = { isl: buildTokenLengthSketch([1_000, 70_000]), osl: buildTokenLengthSketch([100]) };
const C = { isl: buildTokenLengthSketch([5, 5, 9]), osl: null };

function encoded(sequenceLengths: unknown): string {
  return sequenceLengthSketchColumns({
    version: STATS_VERSION,
    sequenceLengths,
  }).sketches!.toString('base64');
}

function mockSql(responses: unknown[][]): { sql: DbClient; values: unknown[][] } {
  const values: unknown[][] = [];
  const sql = ((_strings: TemplateStringsArray, ...params: unknown[]) => {
    values.push(params);
    return Promise.resolve(responses[values.length - 1] ?? []);
  }) as unknown as DbClient;
  return { sql, values };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getResidentSequenceLengthSketches', () => {
  it('merges compact and JSON sketches exactly like the JSON alone, skipping stale rows', async () => {
    const { sql } = mockSql([
      [
        { benchmark_result_id: 1, sketches: encoded(A), version: null, sequence_lengths: null },
        { benchmark_result_id: 2, sketches: null, version: STATS_VERSION, sequence_lengths: B },
        { benchmark_result_id: 3, sketches: null, version: STATS_VERSION - 1, sequence_lengths: C },
        { benchmark_result_id: 4, sketches: encoded(C), version: null, sequence_lengths: null },
        { benchmark_result_id: 5, sketches: encoded(null), version: null, sequence_lengths: null },
      ],
    ]);

    const result = await getResidentSequenceLengthSketches(sql, [1, 2, 3, 4, 5, 6]);

    expect(JSON.stringify(result)).toBe(
      JSON.stringify({
        isl: mergeTokenLengthSketches([A.isl, B.isl, C.isl]),
        osl: mergeTokenLengthSketches([A.osl, B.osl, C.osl]),
        coveredPoints: 3,
        requestedPoints: 6,
      }),
    );
  });

  it('reads the JSON of rows whose compact sketches cannot be decoded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sql, values } = mockSql([
      [
        { benchmark_result_id: 1, sketches: encoded(A), version: null, sequence_lengths: null },
        { benchmark_result_id: 2, sketches: 'AAAA', version: null, sequence_lengths: null },
      ],
      [{ version: STATS_VERSION, sequence_lengths: B }],
    ]);

    const result = await getResidentSequenceLengthSketches(sql, [1, 2]);

    expect(JSON.stringify(result)).toBe(
      JSON.stringify({
        isl: mergeTokenLengthSketches([A.isl, B.isl]),
        osl: mergeTokenLengthSketches([A.osl, B.osl]),
        coveredPoints: 2,
        requestedPoints: 2,
      }),
    );
    expect(values).toHaveLength(2);
    expect(values[1]).toEqual([[2]]);
    expect(warn.mock.calls[0]![0]).toContain('benchmark ids 2');
  });
});

describe('mergeResidentSequenceLengthSketches', () => {
  it('adds the points of each database and merges their sketches', () => {
    expect(
      mergeResidentSequenceLengthSketches([
        { ...A, coveredPoints: 1, requestedPoints: 2 },
        { ...B, coveredPoints: 1, requestedPoints: 1 },
      ]),
    ).toEqual({
      isl: mergeTokenLengthSketches([A.isl, B.isl]),
      osl: mergeTokenLengthSketches([A.osl, B.osl]),
      coveredPoints: 2,
      requestedPoints: 3,
    });
  });

  it('returns a single database unchanged', () => {
    const only = { ...A, coveredPoints: 1, requestedPoints: 2 };
    expect(mergeResidentSequenceLengthSketches([only])).toEqual(only);
  });
});
