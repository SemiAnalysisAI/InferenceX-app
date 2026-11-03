import { describe, expect, it } from 'vitest';

import { DISPLAY_MODEL_TO_DB, rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AvailabilityRow } from '@/lib/api/api';
import { buildAvailabilityHwKey } from '@/lib/charts/chart-utils';
import { frameworkFamily } from '@/lib/catalog/framework-family';
import { SEQUENCE_OPTIONS } from '@/lib/catalog/data-mappings';

import availabilityFixture from '../../../cypress/fixtures/api/availability.json';
import {
  type AvailabilityIndex,
  datesOfLines,
  indexAvailability,
  linesForModels,
} from './availability-index';
import { compactAvailability } from './compact-availability';
import { countCurvesByPrecision } from './default-precisions';
import { withSupplementalAvailability } from './supplemental-benchmarks';

const fixtureRows = availabilityFixture as AvailabilityRow[];

interface Selection {
  keys: readonly string[];
  sequence: string;
  precisions: readonly string[];
  gpus: readonly string[];
  frameworkLock: readonly string[] | null;
}

const hwKeyOf = (r: AvailabilityRow) =>
  buildAvailabilityHwKey(r.hardware, r.framework, r.spec_method, r.disagg, r.benchmark_type);

function fromRows(rows: readonly AvailabilityRow[], s: Selection) {
  const modelRows = rows.filter((r) => s.keys.includes(r.model));
  const seqRows = modelRows.filter((r) => rowToSequence(r) === s.sequence);
  const precRows = seqRows.filter((r) => s.precisions.includes(r.precision));
  const gpuRows = precRows.filter((r) => r.hardware && s.gpus.includes(hwKeyOf(r)));
  const hwKeys = new Set<string>();
  for (const r of precRows) {
    if (!r.hardware) continue;
    if (s.frameworkLock) {
      const family = frameworkFamily(r.framework);
      if (!family || !s.frameworkLock.includes(family)) continue;
    }
    hwKeys.add(hwKeyOf(r));
  }
  return {
    hasModel: rows.some((r) => s.keys.includes(r.model)),
    sequences: [...new Set(modelRows.map((r) => rowToSequence(r)))],
    precisions: [...new Set(seqRows.map((r) => r.precision))].toSorted(),
    curveCounts: Object.entries(countCurvesByPrecision(seqRows)),
    dates: [...new Set((precRows.length > 0 ? precRows : seqRows).map((r) => r.date))].toSorted(),
    gpuDates: [...new Set(gpuRows.map((r) => r.date))].toSorted(),
    hwKeys: [...hwKeys],
  };
}

function fromIndex(index: AvailabilityIndex, s: Selection) {
  const modelLines = linesForModels(index, s.keys);
  const seqLines = modelLines.filter((line) => line.sequence === s.sequence);
  const precLines = seqLines.filter((line) => s.precisions.includes(line.precision));
  const gpuLines = precLines.filter((line) => line.hwKey !== null && s.gpus.includes(line.hwKey));
  const hwKeys = new Set<string>();
  for (const line of precLines) {
    if (line.hwKey === null) continue;
    if (s.frameworkLock) {
      const family = frameworkFamily(line.framework);
      if (!family || !s.frameworkLock.includes(family)) continue;
    }
    hwKeys.add(line.hwKey);
  }
  return {
    hasModel: s.keys.some((key) => index.linesByModel.has(key)),
    sequences: [...new Set(modelLines.map((line) => line.sequence))],
    precisions: [...new Set(seqLines.map((line) => line.precision))].toSorted(),
    curveCounts: Object.entries(countCurvesByPrecision(seqLines)),
    dates: datesOfLines(index, precLines.length > 0 ? precLines : seqLines),
    gpuDates: datesOfLines(index, gpuLines),
    hwKeys: [...hwKeys],
  };
}

function* selections(rows: readonly AvailabilityRow[]): Generator<Selection> {
  const precisions = [...new Set(rows.map((r) => r.precision))];
  for (const keys of [...Object.values(DISPLAY_MODEL_TO_DB), ['dsr1', 'kimik3'], ['absent']]) {
    for (const sequence of SEQUENCE_OPTIONS) {
      const gpus = [
        ...new Set(
          rows
            .filter((r) => keys.includes(r.model) && r.hardware && rowToSequence(r) === sequence)
            .map(hwKeyOf),
        ),
      ];
      for (const precs of [[], ...precisions.map((p) => [p]), precisions]) {
        for (const frameworkLock of [null, ['vllm'], ['sglang', 'trt']]) {
          yield { keys, sequence, precisions: precs, gpus, frameworkLock };
        }
        for (const gpu of gpus) {
          yield { keys, sequence, precisions: precs, gpus: [gpu], frameworkLock: null };
        }
      }
    }
  }
}

async function overWire(rows: readonly AvailabilityRow[]): Promise<AvailabilityIndex> {
  return indexAvailability(await Response.json(compactAvailability(rows)).json());
}

function expectSameDerivations(rows: readonly AvailabilityRow[], index: AvailabilityIndex) {
  let compared = 0;
  for (const selection of selections(rows)) {
    expect(fromIndex(index, selection), JSON.stringify(selection)).toEqual(
      fromRows(rows, selection),
    );
    compared++;
  }
  expect(compared).toBeGreaterThan(1000);
}

describe('availability index', () => {
  it('derives every dashboard value the rows give, in the same order', async () => {
    const rows = withSupplementalAvailability(fixtureRows);
    expectSameDerivations(rows, await overWire(rows));
  });

  it('keeps first-row order when rows of one date arrive in any order', async () => {
    const rows = fixtureRows
      .toReversed()
      .toSorted((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const index = await overWire(rows);
    const inDateOrder = await overWire(fixtureRows);
    expect(index.lines.map((line) => line.model)).not.toEqual(
      inDateOrder.lines.map((line) => line.model),
    );
    expectSameDerivations(rows, index);
  });

  it('collapses repeated rows and sends each line once', () => {
    const row = fixtureRows[0]!;
    const compact = compactAvailability([
      { ...row, date: '2026-01-03' },
      { ...row, date: '2026-01-01' },
      { ...row, date: '2026-01-03' },
      { ...row, date: '2026-01-02' },
      { ...row, date: '2026-01-05' },
      { ...row, disagg: !row.disagg, date: '2026-01-04' },
    ]);
    expect(compact.dates).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
    expect(compact.lines.map((line) => line[9])).toEqual([
      [0, 3, 1, 1],
      [3, 1],
    ]);
    const index = indexAvailability(compact);
    expect(datesOfLines(index, [index.lines[0]!])).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-05',
    ]);
  });

  it('reads dates past the first bitset word', () => {
    const row = fixtureRows[0]!;
    const dates = Array.from({ length: 70 }, (_, day) =>
      new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10),
    );
    const kept = dates.filter((_, day) => day % 3 !== 1);
    const index = indexAvailability(
      compactAvailability([
        ...kept.map((date) => ({ ...row, date })),
        ...dates.map((date) => ({ ...row, hardware: 'other', date })),
      ]),
    );
    expect(datesOfLines(index, [index.lines[0]!])).toEqual(kept);
    expect(datesOfLines(index, index.lines)).toEqual(dates);
  });
});
