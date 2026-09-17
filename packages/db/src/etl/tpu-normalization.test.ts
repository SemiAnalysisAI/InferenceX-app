import { describe, expect, it } from 'vitest';
import sweep from './fixtures/tpu-manual-sweep.json';
import { mapBenchmarkRow } from './benchmark-mapper';
import { mapAggEvalRow, mapEvalRow } from './eval-mapper';
import { createSkipTracker } from './skip-tracker';
import { normalizeLegacyTpuRow, physicalChipCount } from './tpu-normalization';

const RUN = '30864013158';

describe('TPU physical-chip normalization', () => {
  it('repairs the verified sweep without changing latency, concurrency or TP', () => {
    const tracker = createSkipTracker();
    const rows = sweep.benchmarks.map((raw) => mapBenchmarkRow(raw, tracker, undefined, RUN)!);
    expect(rows).toHaveLength(6);
    for (const [i, row] of rows.entries()) {
      expect(row.config.hardware).toBe('tpuv7');
      expect(row.config.numDecodeGpu).toBe(4);
      expect(row.config.numPrefillGpu).toBe(4);
      expect(row.config.decodeTp).toBe(sweep.benchmarks[i].tp);
      expect(row.config.disagg).toBe(false);
      expect(row.conc).toBe(sweep.benchmarks[i].conc);
      expect(row.metrics.median_intvty).toBe(sweep.benchmarks[i].median_intvty);
    }
    const dp8 = rows.find((r) => r.config.decodeTp === 1)!;
    expect(dp8.metrics.dp).toBe(8);
    expect(dp8.metrics.tput_per_gpu).toBeCloseTo(3674.8418266267754, 9);
    expect(dp8.metrics.output_tput_per_gpu).toBeCloseTo(407.69162901997095, 9);
    expect(dp8.metrics.input_tput_per_gpu).toBeCloseTo(3267.1501976068043, 9);
    expect(
      rows.find((r) => r.config.decodeTp === 8 && r.conc === 64)!.metrics.tput_per_gpu,
    ).toBeCloseTo(3705.8131472623354, 9);
  });

  it('uses the same aggregate topology and DP for both evaluation formats', () => {
    for (const raw of sweep.evaluations) {
      const agg = mapAggEvalRow(raw, createSkipTracker(), RUN)!;
      const [individual] = mapEvalRow(
        raw,
        { results: { gsm8k: { em_strict: raw.em_strict } } },
        createSkipTracker(),
        RUN,
      );
      expect(agg.config).toEqual(individual.config);
      expect(agg.config.disagg).toBe(false);
      expect(agg.config.numDecodeGpu).toBe(4);
      expect(agg.metrics.dp).toBe(raw.tp === 1 ? 8 : 1);
      expect(individual.metrics.dp).toBe(agg.metrics.dp);
      expect(agg.metrics.em_strict).toBe(raw.em_strict);
    }
  });

  it('is idempotent and leaves other runs, recipes and explicit modern counts untouched', () => {
    const raw = sweep.benchmarks.find((r) => r.tp === 1)!;
    expect(normalizeLegacyTpuRow(raw, '123')).toBe(raw);
    for (const override of [
      { model: 'another-model' },
      { tp: 2 },
      { num_gpus: 16 },
      { dp: 8 },
      { disagg: true },
    ]) {
      const other = { ...raw, ...override };
      expect(normalizeLegacyTpuRow(other, RUN)).toBe(other);
    }
    const fixed = normalizeLegacyTpuRow(raw, RUN);
    expect(normalizeLegacyTpuRow(fixed, RUN)).toBe(fixed);
  });

  it('prefers valid explicit physical counts and preserves absent-role zero', () => {
    const raw = { ...sweep.benchmarks[0], num_gpus: 16, dp: 4 };
    const row = mapBenchmarkRow(raw, createSkipTracker())!;
    expect(row.config.decodeTp).toBe(8);
    expect(row.config.numDecodeGpu).toBe(16);
    expect(row.metrics.num_gpus).toBeUndefined();
    const v2 = {
      ...raw,
      prefill_tp: 0,
      prefill_ep: 0,
      decode_tp: 8,
      decode_ep: 1,
      num_prefill_gpu: 0,
      num_decode_gpu: 12,
      disagg: true,
    };
    expect(mapBenchmarkRow(v2, createSkipTracker())!.config).toMatchObject({
      numPrefillGpu: 0,
      numDecodeGpu: 12,
    });
    expect(mapAggEvalRow({ ...v2, task: 'gsm8k' }, createSkipTracker())!.config).toMatchObject({
      numPrefillGpu: 0,
      numDecodeGpu: 12,
    });
    for (const value of [0, -4, 1.5, '4.5', '4chips', true, null, Infinity])
      expect(physicalChipCount(value)).toBeUndefined();
    expect(physicalChipCount('16')).toBe(16);
  });
});
