import { describe, expect, it } from 'vitest';
import { powerLimitComparison } from './power-limit';
import type { Json } from './bundle';

// Synthetic recorded snapshots; deliberately different configured and enforced limits.
function fixture() {
  const gpus = ['GPU-a', 'GPU-b'].map((uuid) => ({
    uuid,
    configured_limit_w: 750,
    enforced_limit_w: 700,
  }));
  return {
    phase: {
      valid: true,
      aggregate: { avg_power_w: 1260 },
      per_gpu: { 'GPU-a': { avg_power_w: 650 }, 'GPU-b': { avg_power_w: 610 } },
    },
    before: { status: 'recorded', observed_at: '2026-09-09T01:00:00Z', gpus },
    after: { status: 'recorded', observed_at: '2026-09-09T02:00:00Z', gpus: structuredClone(gpus) },
    uuids: ['GPU-a', 'GPU-b'],
    unit: 'W',
  };
}
function compare(input: ReturnType<typeof fixture>) {
  return powerLimitComparison(input.phase, input.before, input.after, input.uuids, input.unit);
}

describe('Recorded power-limit comparison', () => {
  it('uses enforced watts for the exact participating devices without depending on row order', () => {
    const input = fixture();
    input.after.gpus.reverse();
    expect(compare(input)).toEqual({ watts: 1400, percent: 90 });
  });
  it('withholds mismatched device sets, units, invalid power and changed limits', () => {
    const changes: ((input: ReturnType<typeof fixture>) => void)[] = [
      (input) => {
        input.phase.valid = false;
      },
      (input) => {
        input.unit = 'kW';
      },
      (input) => {
        input.uuids = ['GPU-a', 'GPU-a'];
      },
      (input) => {
        input.uuids = [];
      },
      (input) => {
        input.before.gpus.pop();
      },
      (input) => {
        input.after.gpus[1].uuid = 'GPU-a';
      },
      (input) => {
        input.after.gpus[1].uuid = 'GPU-other';
      },
      (input) => {
        input.after.gpus[0].enforced_limit_w = 650;
      },
      (input) => {
        input.after.gpus[0].configured_limit_w = 700;
      },
      (input) => {
        input.before.gpus[0].enforced_limit_w = Number.NaN;
      },
      (input) => {
        input.before.gpus[0].configured_limit_w = 0;
      },
      (input) => {
        input.after.status = 'unavailable';
      },
      (input) => {
        input.after.observed_at = '2026-09-08T23:00:00Z';
      },
      (input) => {
        input.before.observed_at = '';
      },
      (input) => {
        input.phase.per_gpu['GPU-a'].avg_power_w = -1;
      },
      (input) => {
        input.phase.aggregate.avg_power_w = 650;
      },
    ];
    for (const change of changes) {
      const input = fixture();
      change(input);
      expect(compare(input)).toBeNull();
    }
  });
  it('does not replace absent enforced limits with configured/default/TDP watts', () => {
    const input = fixture();
    const before: Json = {
      ...input.before,
      gpus: input.before.gpus.map(({ uuid }) => ({
        uuid,
        configured_limit_w: 700,
        default_limit_w: 700,
        tdp_w: 700,
      })),
    };
    expect(powerLimitComparison(input.phase, before, input.after, input.uuids, 'W')).toBeNull();
    expect(
      powerLimitComparison(input.phase, input.before, input.after, input.uuids, null),
    ).toBeNull();
    expect(powerLimitComparison(null, null, null, null, null)).toBeNull();
  });
});
