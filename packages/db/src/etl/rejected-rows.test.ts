import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { indexRejectedRows, isRejectedRowsArtifact, readRejectedRows } from './rejected-rows';

const BMK_SOURCE =
  'bmk_dsr1_1k1k_fp8_vllm_tp8_conc64_h200-nv/agg_dsr1_1k1k_fp8_vllm_tp8_conc64_h200-nv.json';
const EVAL_FILE = 'eval_dsr1_1k8k_fp8_vllm_tp8_conc64_h200-nv_1/results_2026-10-01T12-00-00.json';

/** A per-config row InferenceX quarantined for missing `isl`. */
const MISSING_ISL_ROW = {
  result_schema_version: 1,
  hw: 'h200-nv',
  infmax_model_prefix: 'dsr1',
  framework: 'vllm',
  precision: 'fp8',
  osl: 1024,
  conc: 64,
  tput_per_gpu: 1234.5,
};

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rejected-rows-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeArtifact(name: string, file: string, content: unknown): void {
  fs.mkdirSync(path.join(root, name), { recursive: true });
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(path.join(root, name, file), text);
}

describe('readRejectedRows', () => {
  it('finds nothing to skip in runs without rejected_rows artifacts', () => {
    writeArtifact('results_bmk', 'agg_bmk.json', [MISSING_ISL_ROW]);
    writeArtifact(path.dirname(BMK_SOURCE), path.basename(BMK_SOURCE), MISSING_ISL_ROW);

    const rejected = readRejectedRows(root);

    expect(rejected.size).toBe(0);
    expect(rejected.hasBenchmarkFile(BMK_SOURCE, MISSING_ISL_ROW)).toBe(false);
    expect(rejected.hasEvalTask(EVAL_FILE, 'gsm8k')).toBe(false);
  });

  it('matches a quarantined per-config benchmark file by path and content', () => {
    writeArtifact('rejected_rows_bmk', 'rejected_rows.json', [
      {
        source: BMK_SOURCE,
        errors: [{ type: 'missing', loc: ['isl'], msg: 'Field required' }],
        row: MISSING_ISL_ROW,
      },
    ]);

    const rejected = readRejectedRows(root);

    expect(rejected.size).toBe(1);
    expect(rejected.hasBenchmarkFile(BMK_SOURCE, structuredClone(MISSING_ISL_ROW))).toBe(true);
    expect(
      rejected.hasBenchmarkFile(BMK_SOURCE.replace('conc64', 'conc128'), MISSING_ISL_ROW),
    ).toBe(false);
    // A later attempt re-uploaded the same file name with a valid row.
    expect(rejected.hasBenchmarkFile(BMK_SOURCE, { ...MISSING_ISL_ROW, isl: 1024 })).toBe(false);
  });

  it('matches quarantined eval tasks by results file and task, in any download directory', () => {
    writeArtifact('rejected_rows_eval_all', 'rejected_rows.json', [
      {
        source: `eval_results/${EVAL_FILE} [gsm8k]`,
        errors: [{ type: 'finite_number', loc: ['em_flexible'], msg: 'Input should be finite' }],
        row: { result_schema_version: 1, source: `eval_results/${EVAL_FILE}`, task: 'gsm8k' },
      },
    ]);

    const rejected = readRejectedRows(root);

    expect(rejected.size).toBe(1);
    expect(rejected.hasEvalTask(EVAL_FILE, 'gsm8k')).toBe(true);
    expect(rejected.hasEvalTask(EVAL_FILE, 'gpqa_diamond')).toBe(false);
    expect(rejected.hasEvalTask(EVAL_FILE.replace('_1/', '_2/'), 'gsm8k')).toBe(false);
  });

  it('ignores run-stats rejections because run-stats already omits them', () => {
    writeArtifact('rejected_rows_run_stats', 'rejected_rows.json', [
      {
        source: 'h200',
        errors: [{ type: 'value_error', loc: [], msg: 'n_success exceeds total' }],
        row: { result_schema_version: 1, n_success: 9, total: 8 },
      },
    ]);

    expect(readRejectedRows(root).size).toBe(0);
  });

  it('fails closed when a list is not standard JSON', () => {
    writeArtifact(
      'rejected_rows_bmk',
      'rejected_rows.json',
      `[{"source": "${BMK_SOURCE}", "errors": [], "row": {"tput_per_gpu": NaN}}]`,
    );

    expect(() => readRejectedRows(root)).toThrow(
      /Unreadable rejected_rows_bmk\/rejected_rows\.json/,
    );
  });
});

describe('indexRejectedRows', () => {
  it.each([
    [{ name: 'rejected_rows_bmk', data: null }, /must be a JSON array/],
    [
      { name: 'rejected_rows_bmk', data: [{ errors: [], row: {} }] },
      /entry 0 has no source or row/,
    ],
    [{ name: 'rejected_rows_bmk', data: [{ source: BMK_SOURCE, errors: [] }] }, /no source or row/],
    [
      {
        name: 'rejected_rows_eval_all',
        data: [{ source: `eval_results/${EVAL_FILE} [gsm8k]`, errors: [], row: { task: 'gsm8k' } }],
      },
      /entry 0 has no eval source or task/,
    ],
  ])('fails closed when a list cannot identify its rows: %j', (artifact, message) => {
    expect(() => indexRejectedRows([artifact])).toThrow(message);
  });
});

describe('isRejectedRowsArtifact', () => {
  it.each([
    ['rejected_rows_bmk', true],
    ['rejected_rows_eval_all', true],
    ['rejected_rows_run_stats', false],
    ['results_bmk', false],
    ['eval_results_all', false],
  ])('%s → %s', (name, expected) => {
    expect(isRejectedRowsArtifact(name)).toBe(expected);
  });
});
