import { describe, expect, it } from 'vitest';

import {
  isPowerAuditValidationEntry,
  normalizePowerAuditValidations,
  recoveredPowerAudit,
} from './power-audit-validations.js';

const ARTIFACT = 'power_audit_kimik3_agentx_fp4';
const RESULT = 'kimik3_agentx_fp4_conc48.json';
const SOURCE = 'power_validation_kimik3_agentx_fp4_conc48.json';
const VALIDATION = 'LOGS/agentic/conc_48/power_validation.json';
const WINDOW = 'LOGS/power/windows/agentic_power_concurrency_48.json';
const RESULT_PATH = 'agentic/conc_48/agentic_power_concurrency_48.json';
const START = 1789940129.369988;
const END = 1789943769.371839;

function fixture() {
  const selected: Record<string, unknown> = {
    window_file: 'windows/agentic_power_concurrency_48.json',
    result_path: RESULT_PATH,
    benchmark_type: 'custom',
    concurrency: 48,
    start_time_unix: START,
    end_time_unix: END,
    duration: END - START,
  };
  const validation: Record<string, unknown> = {
    power_valid: true,
    selected_window: selected,
    per_gpu_role: { 'host-a/GPU-a': 'prefill', 'host-b/GPU-b': 'decode' },
    validation_errors: [],
  };
  const result: Record<string, unknown> = { conc: 48, power_valid: 1 };
  const window: Record<string, unknown> = {
    schema_version: 1,
    concurrency: 48,
    result_path: RESULT_PATH,
    benchmark_start_time_unix: START,
    benchmark_end_time_unix: END,
    status: 'completed',
  };
  const files = () =>
    new Map([
      [VALIDATION, JSON.stringify(validation)],
      [RESULT, JSON.stringify(result)],
      [WINDOW, JSON.stringify(window)],
    ]);
  return { selected, validation, result, window, files };
}

describe('isPowerAuditValidationEntry', () => {
  it.each([SOURCE, VALIDATION, WINDOW, RESULT])('selects required input %s', (name) => {
    expect(isPowerAuditValidationEntry(name)).toBe(true);
  });

  it.each([
    'manifest.json',
    'unrelated.json',
    'results/kimik3_agentx_fp4_conc48.json',
    'LOGS/power_validation_point.json',
    'LOGS/agentic/conc_048/power_validation.json',
    'LOGS/agentic/conc_0/power_validation.json',
    'LOGS/agentic/conc_48/power_validation_copy.json',
    'logs/agentic/conc_48/power_validation.json',
    'LOGS/power/windows/unrelated_conc48.json',
    'LOGS/power/windows/agentic_power_concurrency_48.json.bak',
  ])('does not select unrelated or unsupported input %s', (name) => {
    expect(isPowerAuditValidationEntry(name)).toBe(false);
  });
});

describe('normalizePowerAuditValidations', () => {
  it('preserves legacy top-level objects without adding new validity gates', () => {
    const legacy = { power_valid: false, selected_window: null, note: 'retained as published' };
    const files = new Map([
      ['power_validation_legacy.json', JSON.stringify(legacy)],
      ['power_validation_empty.json', '{}'],
      ['power_validation_broken.json', '{'],
      ['power_validation_array.json', '[]'],
      ['power_validation_null.json', 'null'],
      ['LOGS/power_validation_copy.json', '{}'],
    ]);
    expect(normalizePowerAuditValidations('legacy-upload', files)).toEqual(
      new Map<string, Record<string, unknown>>([
        ['power_validation_legacy.json', legacy],
        ['power_validation_empty.json', {}],
      ]),
    );
  });

  it('aliases an exactly matched nested document without changing its window, roles or verdict', () => {
    const input = fixture();
    const files = input.files();
    const retained = [...files];
    expect(normalizePowerAuditValidations(ARTIFACT, files)).toEqual(
      new Map([
        [SOURCE, { ...input.validation, validation_path: VALIDATION, result_file: RESULT }],
      ]),
    );
    expect([...files]).toEqual(retained);
    expect(input.validation).not.toHaveProperty('validation_path');
  });

  it.each([false, undefined])(
    'does not manufacture a valid verdict from power_valid=%s',
    (valid) => {
      const input = fixture();
      if (valid === undefined) delete input.validation.power_valid;
      else input.validation.power_valid = valid;
      const normalized = normalizePowerAuditValidations(ARTIFACT, input.files()).get(SOURCE)!;
      expect(normalized).toEqual({
        ...input.validation,
        validation_path: VALIDATION,
        result_file: RESULT,
      });
      expect(Object.hasOwn(normalized, 'power_valid')).toBe(valid !== undefined);
      expect(recoveredPowerAudit(SOURCE, normalized)).toEqual({
        source: SOURCE,
        window_start_unix: START,
        window_end_unix: END,
      });
    },
  );

  it.each([VALIDATION, RESULT, WINDOW])('requires the exact paired input %s', (name) => {
    const files = fixture().files();
    files.delete(name);
    expect(normalizePowerAuditValidations(ARTIFACT, files).size).toBe(0);
  });

  it.each([VALIDATION, RESULT, WINDOW])('rejects malformed or non-object input %s', (name) => {
    for (const text of ['{bad json', '[]', 'null', '48']) {
      const files = fixture().files();
      files.set(name, text);
      expect(normalizePowerAuditValidations(ARTIFACT, files).size).toBe(0);
    }
  });

  it.each([
    ['result', 'conc', 64],
    ['result', 'conc', '48'],
    ['selected', 'concurrency', 64],
    ['selected', 'concurrency', '48'],
    ['selected', 'result_path', 'agentic/conc_64/agentic_power_concurrency_64.json'],
    ['selected', 'window_file', 'windows/agentic_power_concurrency_64.json'],
    ['window', 'concurrency', 64],
    ['window', 'result_path', 'agentic/conc_64/agentic_power_concurrency_64.json'],
    ['window', 'benchmark_start_time_unix', START + 1],
    ['window', 'benchmark_end_time_unix', END - 1],
  ] as const)('rejects mismatched %s.%s', (document, field, value) => {
    const input = fixture();
    input[document][field] = value;
    expect(normalizePowerAuditValidations(ARTIFACT, input.files()).size).toBe(0);
  });

  it.each([
    [0, END],
    [-1, END],
    [START, START],
    [END, START],
    [null, END],
    [START, '1789943769.371839'],
  ])('rejects an invalid selected time range %s to %s', (start, end) => {
    const input = fixture();
    input.selected.start_time_unix = start;
    input.window.benchmark_start_time_unix = start;
    input.selected.end_time_unix = end;
    input.window.benchmark_end_time_unix = end;
    expect(normalizePowerAuditValidations(ARTIFACT, input.files()).size).toBe(0);
  });

  it('rejects an overflowing JSON number instead of emitting an infinite time', () => {
    const files = fixture().files();
    files.set(VALIDATION, files.get(VALIDATION)!.replace(String(START), '1e400'));
    files.set(WINDOW, files.get(WINDOW)!.replace(String(START), '1e400'));
    expect(normalizePowerAuditValidations(ARTIFACT, files).size).toBe(0);
  });

  it('does not guess the result from another root file with the same concurrency', () => {
    const files = fixture().files();
    files.set('different_config_conc48.json', files.get(RESULT)!);
    files.delete(RESULT);
    expect(normalizePowerAuditValidations(ARTIFACT, files).size).toBe(0);
  });

  it('does not borrow a document from a different nested concurrency directory', () => {
    const files = fixture().files();
    files.set('LOGS/agentic/conc_64/power_validation.json', files.get(VALIDATION)!);
    files.delete(VALIDATION);
    files.set('kimik3_agentx_fp4_conc64.json', JSON.stringify({ conc: 64 }));
    expect(normalizePowerAuditValidations(ARTIFACT, files).size).toBe(0);
  });

  it('leaves a canonical legacy document authoritative regardless of insertion order', () => {
    const files = fixture().files();
    const legacy = { power_valid: false, selected_window: null, note: 'legacy wins' };
    files.set(SOURCE, JSON.stringify(legacy));
    expect(normalizePowerAuditValidations(ARTIFACT, files)).toEqual(new Map([[SOURCE, legacy]]));
    expect(normalizePowerAuditValidations(ARTIFACT, new Map([...files].toReversed()))).toEqual(
      new Map([[SOURCE, legacy]]),
    );
  });

  it('does not derive AgentX aliases for an unrelated artifact', () => {
    expect(
      normalizePowerAuditValidations('gpu_metrics_kimik3_agentx_fp4', fixture().files()).size,
    ).toBe(0);
  });
});

describe('recoveredPowerAudit', () => {
  it('returns only source and recorded times from a normalized nested validation', () => {
    const normalized = normalizePowerAuditValidations(ARTIFACT, fixture().files()).get(SOURCE)!;
    expect(recoveredPowerAudit(SOURCE, normalized)).toEqual({
      source: SOURCE,
      window_start_unix: START,
      window_end_unix: END,
    });
  });

  it('does not treat an ordinary legacy validation as recovered AgentX metadata', () => {
    expect(recoveredPowerAudit(SOURCE, fixture().validation)).toBeNull();
  });

  it.each([
    ['validation_path', 'LOGS/agentic/conc_64/power_validation.json'],
    ['validation_path', 'power_validation_legacy.json'],
    ['result_file', 'kimik3_agentx_fp4_conc64.json'],
    ['result_file', 'nested/kimik3_agentx_fp4_conc48.json'],
    ['selected_window', null],
    ['selected_window', { concurrency: 48, start_time_unix: START, end_time_unix: Infinity }],
    ['selected_window', { concurrency: 48, start_time_unix: END, end_time_unix: START }],
    ['selected_window', { concurrency: 64, start_time_unix: START, end_time_unix: END }],
  ])('rejects inconsistent recovery metadata in %s', (field, value) => {
    const normalized = normalizePowerAuditValidations(ARTIFACT, fixture().files()).get(SOURCE)!;
    normalized[String(field)] = value;
    expect(recoveredPowerAudit(SOURCE, normalized)).toBeNull();
  });

  it('requires the alias to match the actual result filename', () => {
    const normalized = normalizePowerAuditValidations(ARTIFACT, fixture().files()).get(SOURCE)!;
    expect(
      recoveredPowerAudit('power_validation_different_config_conc48.json', normalized),
    ).toBeNull();
  });
});
