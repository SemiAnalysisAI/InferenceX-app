import { describe, expect, it } from 'vitest';

import type { BenchmarkPersistenceInput } from './benchmark-ingest.js';
import { agentxWindowPlan, attachAgentxAudits } from './power-audit-recovery.js';

function nested(conc: number, resultFile: string, start = 1000) {
  return {
    power_valid: true,
    validation_path: `LOGS/agentic/conc_${conc}/power_validation.json`,
    result_file: resultFile,
    selected_window: {
      concurrency: conc,
      start_time_unix: start,
      end_time_unix: start + 100,
      result_path: `agentic/conc_${conc}/agentic_power_concurrency_${conc}.json`,
      window_file: `windows/agentic_power_concurrency_${conc}.json`,
    },
  };
}

const RESULT_48 = 'kimik3_recipe-a_conc48.json';
const SOURCE_48 = `power_validation_${RESULT_48.slice(0, -5)}.json`;
const AUDIT_48 = { source: SOURCE_48, window_start_unix: 1000, window_end_unix: 1100 };

function point(overrides: Partial<BenchmarkPersistenceInput> = {}): BenchmarkPersistenceInput {
  return {
    configId: 1,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 48,
    offloadMode: 'on',
    image: 'image',
    recipeFingerprint: 'recipe-a',
    metrics: { power_valid: 1, avg_power_w: 234.5, mean_ttft: 0.2 },
    ...overrides,
  };
}

describe('agentxWindowPlan', () => {
  it('maps each concurrency to its one recoverable window and ignores legacy documents', () => {
    const plan = agentxWindowPlan({
      [SOURCE_48]: nested(48, RESULT_48),
      'power_validation_kimik3_recipe-a_conc96.json': nested(
        96,
        'kimik3_recipe-a_conc96.json',
        5000,
      ),
      // A top-level document names the concurrency but carries no retained alias.
      'power_validation_legacy.json': {
        power_valid: true,
        selected_window: nested(48, RESULT_48, 2000).selected_window,
      },
    });
    expect([...plan]).toEqual([
      [48, AUDIT_48],
      [
        96,
        {
          source: 'power_validation_kimik3_recipe-a_conc96.json',
          window_start_unix: 5000,
          window_end_unix: 5100,
        },
      ],
    ]);
  });
});

const describePoint = (p: BenchmarkPersistenceInput) => `${p.conc}/${p.offloadMode}`;

describe('attachAgentxAudits', () => {
  const plan = agentxWindowPlan({ [SOURCE_48]: nested(48, RESULT_48) });

  it('attaches the window to the single agentic point at its concurrency and leaves the rest untouched', () => {
    const agentic = point();
    const other = point({ conc: 32 });
    const singleTurn = point({ benchmarkType: 'single_turn', isl: 1024, osl: 1024 });
    const result = attachAgentxAudits(plan, [singleTurn, agentic, other], describePoint);
    expect(result.points.map((p) => p.powerAudit)).toEqual([undefined, AUDIT_48, undefined]);
    expect(result.points[0]).toBe(singleTurn);
    expect(result.points[2]).toBe(other);
    expect(result.points[1]!.metrics).toBe(agentic.metrics);
    expect(agentic.powerAudit).toBeUndefined();
    expect(result).toMatchObject({ attached: 1, refused: [] });
  });

  it('refuses, by name, a concurrency shared by two points instead of guessing', () => {
    const result = attachAgentxAudits(
      plan,
      [point({ offloadMode: 'on' }), point({ offloadMode: 'off' })],
      describePoint,
    );
    expect(result.points.map((p) => p.powerAudit)).toEqual([undefined, undefined]);
    expect(result.refused).toEqual([{ concurrency: 48, points: ['48/on', '48/off'] }]);
  });
});
