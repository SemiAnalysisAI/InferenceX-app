import { describe, expect, it } from 'vitest';

import { Model, Sequence } from '@/lib/data-mappings';

import {
  FAVORITE_PRESETS,
  findClosestDate,
  findConfigChangeDates,
  subtractMonths,
} from './favorite-presets';

// ── findClosestDate ──────────────────────────────────────────────────

describe('findClosestDate', () => {
  it('returns empty string for empty array', () => {
    expect(findClosestDate([], '2025-01-15')).toBe('');
  });

  it('returns exact match when available', () => {
    expect(findClosestDate(['2025-01-01', '2025-01-15', '2025-02-01'], '2025-01-15')).toBe(
      '2025-01-15',
    );
  });

  it('returns closest earlier date', () => {
    expect(findClosestDate(['2025-01-01', '2025-01-10', '2025-02-01'], '2025-01-08')).toBe(
      '2025-01-10',
    );
  });

  it('returns closest later date', () => {
    expect(findClosestDate(['2025-01-01', '2025-01-20', '2025-02-01'], '2025-01-18')).toBe(
      '2025-01-20',
    );
  });

  it('returns first date when target is before all dates', () => {
    expect(findClosestDate(['2025-06-01', '2025-07-01'], '2025-01-01')).toBe('2025-06-01');
  });

  it('returns last date when target is after all dates', () => {
    expect(findClosestDate(['2025-01-01', '2025-02-01'], '2025-12-31')).toBe('2025-02-01');
  });

  it('handles single-element array', () => {
    expect(findClosestDate(['2025-03-15'], '2025-01-01')).toBe('2025-03-15');
  });
});

// ── subtractMonths ───────────────────────────────────────────────────

describe('subtractMonths', () => {
  it('subtracts 1 month', () => {
    expect(subtractMonths('2025-03-15', 1)).toBe('2025-02-15');
  });

  it('subtracts 2 months', () => {
    expect(subtractMonths('2025-03-15', 2)).toBe('2025-01-15');
  });

  it('wraps across year boundary', () => {
    expect(subtractMonths('2025-01-15', 2)).toBe('2024-11-15');
  });

  it('handles month-end overflow (Mar 31 - 1 month)', () => {
    // March 31 minus 1 month: Feb has no 31st, JS Date rolls to Mar 3
    const result = subtractMonths('2025-03-31', 1);
    expect(result).toMatch(/^2025-0[23]-/);
  });

  it('returns same date for 0 months', () => {
    expect(subtractMonths('2025-06-15', 0)).toBe('2025-06-15');
  });

  it('returns YYYY-MM-DD format', () => {
    expect(subtractMonths('2025-06-15', 3)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── FAVORITE_PRESETS data integrity ─────────────────────────────────

describe('FAVORITE_PRESETS data integrity', () => {
  it('has unique IDs', () => {
    const ids = FAVORITE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has required fields on every preset', () => {
    for (const preset of FAVORITE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.title).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.tags.length).toBeGreaterThan(0);
      expect(['comparison', 'improvements']).toContain(preset.category);
      expect(Object.values(Model)).toContain(preset.config.model);
      expect(Object.values(Sequence)).toContain(preset.config.sequence);
      expect(preset.config.precisions.length).toBeGreaterThan(0);
      expect(preset.config.yAxisMetric).toBeTruthy();
    }
  });

  it('has valid precision values', () => {
    const validPrecisions = ['fp4', 'fp8', 'bf16', 'int4'];
    for (const preset of FAVORITE_PRESETS) {
      for (const prec of preset.config.precisions) {
        expect(validPrecisions).toContain(prec);
      }
    }
  });

  it('timeline presets have gpus and dateRange config', () => {
    const timelinePresets = FAVORITE_PRESETS.filter((p) => p.config.useDateRange);
    expect(timelinePresets.length).toBeGreaterThan(0);
    for (const preset of timelinePresets) {
      expect(preset.config.gpus).toBeDefined();
      expect(preset.config.gpus!.length).toBeGreaterThan(0);
    }
  });

  it('scatter presets have hwFilter but no gpus', () => {
    const scatterPresets = FAVORITE_PRESETS.filter((p) => !p.config.useDateRange);
    expect(scatterPresets.length).toBeGreaterThan(0);
    for (const preset of scatterPresets) {
      expect(preset.config.hwFilter).toBeDefined();
      expect(preset.config.hwFilter!.length).toBeGreaterThan(0);
      expect(preset.config.gpus).toBeUndefined();
    }
  });
});

// ── Precision compatibility ──────────────────────────────────────────

describe('precision compatibility', () => {
  // FP8-only hardware: H200, MI300X, MI325X cannot use FP4
  const FP8_ONLY_HW_PREFIXES = ['h200', 'mi300x', 'mi325x'];

  it('presets with FP8-only hardware do not use fp4-only precisions', () => {
    for (const preset of FAVORITE_PRESETS) {
      const hwPrefixes = preset.config.hwFilter ?? [];
      const hasFp8OnlyHw = hwPrefixes.some((hw) =>
        FP8_ONLY_HW_PREFIXES.some((prefix) => hw.startsWith(prefix)),
      );
      if (hasFp8OnlyHw) {
        expect(preset.config.precisions).toContain('fp8');
        expect(preset.config.precisions).not.toEqual(['fp4']);
      }
    }
  });

  it('b200-vs-h200 uses fp8 (H200 has no fp4)', () => {
    const preset = FAVORITE_PRESETS.find((p) => p.id === 'b200-vs-h200');
    expect(preset).toBeDefined();
    expect(preset!.config.precisions).toEqual(['fp8']);
  });

  it('amd-generations uses fp8 (MI300X/MI325X have no fp4)', () => {
    const preset = FAVORITE_PRESETS.find((p) => p.id === 'amd-generations');
    expect(preset).toBeDefined();
    expect(preset!.config.precisions).toEqual(['fp8']);
  });
});

// ── Description/config alignment ─────────────────────────────────────

describe('description/config alignment', () => {
  it('hwFilter entries are mentioned in title, description, or tags', () => {
    for (const preset of FAVORITE_PRESETS) {
      const hwPrefixes = preset.config.hwFilter ?? [];
      const searchText =
        `${preset.title} ${preset.description} ${preset.tags.join(' ')}`.toLowerCase();
      for (const hw of hwPrefixes) {
        expect(searchText).toContain(hw.toLowerCase());
      }
    }
  });
});

// ── findConfigChangeDates ─────────────────────────────────────────────

describe('findConfigChangeDates', () => {
  const row = (
    date: string,
    hw: string,
    fw: string,
    conc: number,
    tp: number,
    ep: number,
    dpa: boolean,
    prec = 'fp4',
  ) => ({
    hardware: hw,
    framework: fw,
    precision: prec,
    conc,
    decode_tp: tp,
    decode_ep: ep,
    decode_dp_attention: dpa,
    date,
  });

  it('returns empty array for no matching rows', () => {
    expect(findConfigChangeDates([], ['b200'], ['fp4'], '2025-01-01', '2025-12-31')).toEqual([]);
  });

  it('returns single date when only one date has data', () => {
    const rows = [row('2025-10-01', 'b200', 'sglang', 1, 8, 8, false)];
    expect(
      findConfigChangeDates(rows, ['b200_sglang'], ['fp4'], '2025-01-01', '2025-12-31'),
    ).toEqual(['2025-10-01']);
  });

  it('returns dates where config set differs from previous date', () => {
    const rows = [
      // Oct 1: config A
      row('2025-10-01', 'b200', 'sglang', 1, 8, 8, false),
      // Oct 2: same config A → should be skipped (no change)
      row('2025-10-02', 'b200', 'sglang', 1, 8, 8, false),
      // Oct 3: config A + new config B → config set changed
      row('2025-10-03', 'b200', 'sglang', 1, 8, 8, false),
      row('2025-10-03', 'b200', 'sglang', 2, 16, 16, true),
      // Oct 4: same as Oct 3 → should be skipped (no change)
      row('2025-10-04', 'b200', 'sglang', 1, 8, 8, false),
      row('2025-10-04', 'b200', 'sglang', 2, 16, 16, true),
      // Oct 5: only config B (subset of Oct 4) → config set changed (removal)
      row('2025-10-05', 'b200', 'sglang', 2, 16, 16, true),
      // Oct 6: new config C → config set changed
      row('2025-10-06', 'b200', 'sglang', 4, 32, 32, true),
    ];
    const result = findConfigChangeDates(
      rows,
      ['b200_sglang'],
      ['fp4'],
      '2025-10-01',
      '2025-10-06',
    );
    expect(result).toEqual(['2025-10-01', '2025-10-03', '2025-10-05', '2025-10-06']);
  });

  it('detects config removals as changes', () => {
    const rows = [
      // Oct 1: full run with configs A, B, C
      row('2025-10-01', 'b200', 'sglang', 1, 8, 8, false),
      row('2025-10-01', 'b200', 'sglang', 2, 16, 16, true),
      row('2025-10-01', 'b200', 'sglang', 4, 32, 32, false),
      // Oct 2: partial run with only config A → config set changed (B, C removed)
      row('2025-10-02', 'b200', 'sglang', 1, 8, 8, false),
      // Oct 3: partial run with configs A, B → config set changed (B added back)
      row('2025-10-03', 'b200', 'sglang', 1, 8, 8, false),
      row('2025-10-03', 'b200', 'sglang', 2, 16, 16, true),
    ];
    const result = findConfigChangeDates(
      rows,
      ['b200_sglang'],
      ['fp4'],
      '2025-10-01',
      '2025-10-03',
    );
    expect(result).toEqual(['2025-10-01', '2025-10-02', '2025-10-03']);
  });

  it('filters by GPU prefix', () => {
    const rows = [
      row('2025-10-01', 'b200', 'sglang', 1, 8, 8, false),
      row('2025-10-02', 'h200', 'sglang', 1, 8, 8, false), // different GPU
    ];
    const result = findConfigChangeDates(
      rows,
      ['b200_sglang'],
      ['fp4'],
      '2025-10-01',
      '2025-10-02',
    );
    expect(result).toEqual(['2025-10-01']);
  });

  it('filters by precision', () => {
    const rows = [
      row('2025-10-01', 'b200', 'sglang', 1, 8, 8, false, 'fp4'),
      row('2025-10-02', 'b200', 'sglang', 1, 8, 8, false, 'fp8'), // different precision
    ];
    const result = findConfigChangeDates(
      rows,
      ['b200_sglang'],
      ['fp4'],
      '2025-10-01',
      '2025-10-02',
    );
    expect(result).toEqual(['2025-10-01']);
  });

  it('filters by date range', () => {
    const rows = [
      row('2025-09-01', 'b200', 'sglang', 1, 8, 8, false), // before range
      row('2025-10-01', 'b200', 'sglang', 1, 8, 8, false),
      row('2025-12-01', 'b200', 'sglang', 1, 8, 8, false), // after range
    ];
    const result = findConfigChangeDates(
      rows,
      ['b200_sglang'],
      ['fp4'],
      '2025-10-01',
      '2025-11-01',
    );
    expect(result).toEqual(['2025-10-01']);
  });
});

// ── findClosestDate + subtractMonths integration ─────────────────────

describe('findClosestDate + subtractMonths integration', () => {
  it('finds a reasonable start date for a 2-month range', () => {
    const dates = ['2025-01-05', '2025-01-20', '2025-02-10', '2025-03-01', '2025-03-15'];
    const latest = dates[dates.length - 1];
    const target = subtractMonths(latest, 2);
    const start = findClosestDate(dates, target);
    expect(dates).toContain(start);
    expect(new Date(start).getTime()).toBeLessThan(new Date(latest).getTime());
  });
});
