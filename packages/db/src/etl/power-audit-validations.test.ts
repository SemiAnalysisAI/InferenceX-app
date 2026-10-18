import { describe, expect, it } from 'vitest';

import { normalizePowerAuditValidations } from './power-audit-validations.js';

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

describe('normalizePowerAuditValidations', () => {
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

  it('rejects mismatched window.benchmark_start_time_unix', () => {
    const input = fixture();
    input.window.benchmark_start_time_unix = START + 1;
    expect(normalizePowerAuditValidations(ARTIFACT, input.files()).size).toBe(0);
  });
});
