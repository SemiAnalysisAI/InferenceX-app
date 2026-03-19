import { describe, it, expect } from 'vitest';
import { mapEvalRow, mapAggEvalRow } from './eval-mapper';
import { createSkipTracker } from './skip-tracker';

/** Minimal valid meta_env.json for eval ZIPs. */
function makeMeta(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'h200-nv',
    framework: 'vllm',
    precision: 'fp8',
    tp: 8,
    ep: 1,
    isl: 1024,
    osl: 8192,
    conc: 64,
    ...overrides,
  };
}

/** Minimal valid results JSON for eval ZIPs. */
function makeResults(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    lm_eval_version: '0.4.7',
    results: {
      gsm8k: {
        'exact_match,strict-match': 0.85,
        'exact_match_stderr,strict-match': 0.01,
        'exact_match,flexible-extract': 0.9,
        'exact_match_stderr,flexible-extract': 0.008,
        alias: 'gsm8k',
      },
    },
    'n-samples': {
      gsm8k: { effective: 1000 },
    },
    ...overrides,
  };
}

/** Minimal valid flat row from agg_eval_all.json. */
function makeAggRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'h200-nv',
    framework: 'vllm',
    precision: 'fp8',
    tp: 8,
    ep: 1,
    task: 'gsm8k',
    em_strict: 0.85,
    em_strict_se: 0.01,
    em_flexible: 0.9,
    em_flexible_se: 0.008,
    n_eff: 1000,
    source: 'eval_dsr1_1k8k_12345678.zip',
    ...overrides,
  };
}

describe('mapEvalRow', () => {
  it('maps valid meta + results to EvalParams array', () => {
    const tracker = createSkipTracker();
    const result = mapEvalRow(makeMeta(), makeResults(), tracker);

    expect(result).toHaveLength(1);
    const ev = result[0];
    expect(ev.config.hardware).toBe('h200');
    expect(ev.config.framework).toBe('vllm');
    expect(ev.config.model).toBe('dsr1');
    expect(ev.config.precision).toBe('fp8');
    expect(ev.config.specMethod).toBe('none');
    expect(ev.config.disagg).toBe(false);
    expect(ev.task).toBe('gsm8k');
    expect(ev.isl).toBe(1024);
    expect(ev.osl).toBe(8192);
    expect(ev.conc).toBe(64);
    expect(ev.lmEvalVersion).toBe('0.4.7');
  });

  it('renames lm-eval metric keys to standardized names', () => {
    const tracker = createSkipTracker();
    const result = mapEvalRow(makeMeta(), makeResults(), tracker);
    const metrics = result[0].metrics;

    expect(metrics.em_strict).toBe(0.85);
    expect(metrics.em_strict_se).toBe(0.01);
    expect(metrics.em_flexible).toBe(0.9);
    expect(metrics.em_flexible_se).toBe(0.008);
  });

  it('extracts n_eff from n-samples top-level dict', () => {
    const tracker = createSkipTracker();
    const result = mapEvalRow(makeMeta(), makeResults(), tracker);

    expect(result[0].metrics.n_eff).toBe(1000);
  });

  it('excludes alias from metrics', () => {
    const tracker = createSkipTracker();
    const result = mapEvalRow(makeMeta(), makeResults(), tracker);

    expect(result[0].metrics).not.toHaveProperty('alias');
  });

  it('returns multiple EvalParams for multiple tasks', () => {
    const tracker = createSkipTracker();
    const results = makeResults({
      results: {
        gsm8k: { 'exact_match,strict-match': 0.85 },
        humaneval: { 'exact_match,strict-match': 0.42 },
      },
    });
    const evs = mapEvalRow(makeMeta(), results, tracker);

    expect(evs).toHaveLength(2);
    const tasks = evs.map((e) => e.task).sort();
    expect(tasks).toEqual(['gsm8k', 'humaneval']);
  });

  it('sets parallelism correctly (v1 single tp/ep)', () => {
    const tracker = createSkipTracker();
    const result = mapEvalRow(makeMeta({ tp: 4, ep: 2 }), makeResults(), tracker);
    const cfg = result[0].config;

    expect(cfg.prefillTp).toBe(4);
    expect(cfg.prefillEp).toBe(2);
    expect(cfg.decodeTp).toBe(4);
    expect(cfg.decodeEp).toBe(2);
    expect(cfg.numPrefillGpu).toBe(8);
    expect(cfg.numDecodeGpu).toBe(8);
  });

  it('returns null isl/osl/conc when missing from meta', () => {
    const tracker = createSkipTracker();
    const meta = makeMeta();
    delete meta.isl;
    delete meta.osl;
    delete meta.conc;
    const result = mapEvalRow(meta, makeResults(), tracker);

    expect(result[0].isl).toBeNull();
    expect(result[0].osl).toBeNull();
    expect(result[0].conc).toBeNull();
  });

  it('returns null lmEvalVersion when missing from results', () => {
    const tracker = createSkipTracker();
    const results = makeResults();
    delete results.lm_eval_version;
    const ev = mapEvalRow(makeMeta(), results, tracker);

    expect(ev[0].lmEvalVersion).toBeNull();
  });

  describe('edge cases', () => {
    it('handles results with non-object results dict', () => {
      const tracker = createSkipTracker();
      const result = mapEvalRow(
        makeMeta(),
        { lm_eval_version: '0.4.7', results: 'invalid' },
        tracker,
      );

      expect(result).toEqual([]);
    });

    it('handles task with no numeric metrics', () => {
      const tracker = createSkipTracker();
      const results = makeResults({
        results: { gsm8k: { alias: 'gsm8k' } },
      });
      const evs = mapEvalRow(makeMeta(), results, tracker);

      expect(evs).toHaveLength(1);
      expect(evs[0].metrics).not.toHaveProperty('alias');
    });

    it('handles n-samples missing for a task', () => {
      const tracker = createSkipTracker();
      const results = makeResults({ 'n-samples': {} });
      const evs = mapEvalRow(makeMeta(), results, tracker);

      expect(evs).toHaveLength(1);
      expect(evs[0].metrics).not.toHaveProperty('n_eff');
    });

    it('handles missing precision (defaults to fp8)', () => {
      const tracker = createSkipTracker();
      const meta = makeMeta();
      delete meta.precision;
      const result = mapEvalRow(meta, makeResults(), tracker);

      expect(result[0].config.precision).toBe('fp8');
    });

    it('handles dp_attention as string "True"', () => {
      const tracker = createSkipTracker();
      const result = mapEvalRow(makeMeta({ dp_attention: 'True' }), makeResults(), tracker);

      expect(result[0].config.prefillDpAttn).toBe(true);
    });
  });

  describe('skip tracking', () => {
    it('skips unmapped model and tracks it', () => {
      const tracker = createSkipTracker();
      const result = mapEvalRow(
        makeMeta({ infmax_model_prefix: 'nonexistent', model: undefined }),
        makeResults(),
        tracker,
      );

      expect(result).toEqual([]);
      expect(tracker.skips.unmappedModel).toBe(1);
      expect(tracker.unmappedModels.has('nonexistent')).toBe(true);
    });

    it('skips unmapped hardware and tracks it', () => {
      const tracker = createSkipTracker();
      const result = mapEvalRow(makeMeta({ hw: 'imaginary-gpu' }), makeResults(), tracker);

      expect(result).toEqual([]);
      expect(tracker.skips.unmappedHw).toBe(1);
      expect(tracker.unmappedHws.has('imaginary-gpu')).toBe(true);
    });

    it('returns empty array when results dict is missing', () => {
      const tracker = createSkipTracker();
      const result = mapEvalRow(makeMeta(), { lm_eval_version: '0.4.7' }, tracker);

      expect(result).toEqual([]);
    });

    it('returns empty array when results dict is empty', () => {
      const tracker = createSkipTracker();
      const result = mapEvalRow(makeMeta(), { lm_eval_version: '0.4.7', results: {} }, tracker);

      expect(result).toEqual([]);
    });
  });
});

describe('mapAggEvalRow', () => {
  it('maps a valid agg row to EvalParams', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow(), tracker);

    expect(result).not.toBeNull();
    expect(result!.config.hardware).toBe('h200');
    expect(result!.config.framework).toBe('vllm');
    expect(result!.config.model).toBe('dsr1');
    expect(result!.task).toBe('gsm8k');
  });

  it('parses ISL/OSL from source filename', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow({ source: 'eval_dsr1_1k8k_12345678.zip' }), tracker);

    expect(result!.isl).toBe(1024);
    expect(result!.osl).toBe(8192);
  });

  it('returns null isl/osl when source is missing', () => {
    const tracker = createSkipTracker();
    const row = makeAggRow();
    delete row.source;
    const result = mapAggEvalRow(row, tracker);

    expect(result!.isl).toBeNull();
    expect(result!.osl).toBeNull();
  });

  it('captures standard eval metrics', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow({ score: 0.92, score_se: 0.005 }), tracker);

    expect(result!.metrics.em_strict).toBe(0.85);
    expect(result!.metrics.em_flexible).toBe(0.9);
    expect(result!.metrics.n_eff).toBe(1000);
    expect(result!.metrics.score).toBe(0.92);
    expect(result!.metrics.score_se).toBe(0.005);
  });

  it('lowercases task name', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow({ task: 'GSM8K' }), tracker);

    expect(result!.task).toBe('gsm8k');
  });

  it('sets parallelism from flat tp/ep fields', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow({ tp: 4, ep: 2 }), tracker);

    expect(result!.config.prefillTp).toBe(4);
    expect(result!.config.prefillEp).toBe(2);
    expect(result!.config.numPrefillGpu).toBe(8);
    expect(result!.config.numDecodeGpu).toBe(8);
  });

  it('sets isMultinode to false always', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow(), tracker);

    expect(result!.config.isMultinode).toBe(false);
  });

  describe('skip tracking', () => {
    it('skips unmapped model', () => {
      const tracker = createSkipTracker();
      const result = mapAggEvalRow(
        makeAggRow({ infmax_model_prefix: 'nonexistent', model: 'nonexistent' }),
        tracker,
      );

      expect(result).toBeNull();
      expect(tracker.skips.unmappedModel).toBe(1);
    });

    it('skips unmapped hardware', () => {
      const tracker = createSkipTracker();
      const result = mapAggEvalRow(makeAggRow({ hw: 'imaginary-gpu' }), tracker);

      expect(result).toBeNull();
      expect(tracker.skips.unmappedHw).toBe(1);
    });

    it('returns null when task is empty', () => {
      const tracker = createSkipTracker();
      const result = mapAggEvalRow(makeAggRow({ task: '' }), tracker);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('does not reject whitespace-only task (no trim)', () => {
      const tracker = createSkipTracker();
      const result = mapAggEvalRow(makeAggRow({ task: '  ' }), tracker);

      expect(result).not.toBeNull();
      expect(result!.task).toBe('  ');
    });

    it('handles source with unparseable ISL/OSL format', () => {
      const tracker = createSkipTracker();
      const result = mapAggEvalRow(makeAggRow({ source: 'eval_dsr1_unknown_format.zip' }), tracker);

      expect(result!.isl).toBeNull();
      expect(result!.osl).toBeNull();
    });

    it('handles missing precision (defaults to fp8)', () => {
      const tracker = createSkipTracker();
      const row = makeAggRow();
      delete row.precision;
      const result = mapAggEvalRow(row, tracker);

      expect(result!.config.precision).toBe('fp8');
    });

    it('skips undefined metric values', () => {
      const tracker = createSkipTracker();
      const row = makeAggRow();
      delete row.em_strict;
      delete row.em_strict_se;
      const result = mapAggEvalRow(row, tracker);

      expect(result!.metrics).not.toHaveProperty('em_strict');
      expect(result!.metrics).not.toHaveProperty('em_strict_se');
      expect(result!.metrics.em_flexible).toBe(0.9);
    });
  });

  it('normalizes framework for agg row', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow({ framework: 'sglang-disagg' }), tracker);

    expect(result!.config.framework).toBe('mori-sglang');
    expect(result!.config.disagg).toBe(true);
  });

  it('reads conc from agg row', () => {
    const tracker = createSkipTracker();
    const result = mapAggEvalRow(makeAggRow({ conc: 32 }), tracker);

    expect(result!.conc).toBe(32);
  });

  it('returns null conc when absent', () => {
    const tracker = createSkipTracker();
    const row = makeAggRow();
    delete row.conc;
    const result = mapAggEvalRow(row, tracker);

    expect(result!.conc).toBeNull();
  });
});
