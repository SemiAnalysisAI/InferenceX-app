import { rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AvailabilityRow } from '@/lib/api/api';
import { buildAvailabilityHwKey } from '@/lib/charts/chart-utils';

import type { CompactAvailability } from './compact-availability';

export interface AvailabilityLine extends Readonly<Omit<AvailabilityRow, 'date'>> {
  readonly sequence: string | null;
  readonly hwKey: string | null;
  readonly dates: Uint32Array;
}

export interface AvailabilityIndex {
  readonly dates: readonly string[];
  readonly lines: readonly AvailabilityLine[];
  readonly linesByModel: ReadonlyMap<string, readonly AvailabilityLine[]>;
}

export function indexAvailability(compact: CompactAvailability): AvailabilityIndex {
  const { dates, models, precisions, hardware, frameworks, specMethods, benchmarkTypes } = compact;
  const words = (dates.length + 31) >>> 5;
  const bits = new Uint32Array(compact.lines.length * words);
  const linesByModel = new Map<string, AvailabilityLine[]>();
  const lines = compact.lines.map(
    ([m, isl, osl, p, h, f, s, disagg, b, runs], i): AvailabilityLine => {
      const lineDates = bits.subarray(i * words, (i + 1) * words);
      let date = 0;
      for (let r = 0; r < runs.length; r += 2) {
        date += runs[r]!;
        for (const end = date + runs[r + 1]!; date < end; date++) {
          lineDates[date >>> 5]! |= 1 << (date & 31);
        }
      }
      const model = models[m]!;
      const lineHardware = hardware[h]!;
      const framework = frameworks[f]!;
      const specMethod = specMethods[s]!;
      const benchmarkType = benchmarkTypes[b]!;
      const line: AvailabilityLine = {
        model,
        isl,
        osl,
        precision: precisions[p]!,
        hardware: lineHardware,
        framework,
        spec_method: specMethod,
        disagg,
        benchmark_type: benchmarkType,
        sequence: rowToSequence({ isl, osl, benchmark_type: benchmarkType }),
        hwKey: lineHardware
          ? buildAvailabilityHwKey(lineHardware, framework, specMethod, disagg, benchmarkType)
          : null,
        dates: lineDates,
      };
      const modelLines = linesByModel.get(model);
      if (modelLines) modelLines.push(line);
      else linesByModel.set(model, [line]);
      return line;
    },
  );
  return { dates, lines, linesByModel };
}

export function linesForModels(
  index: AvailabilityIndex,
  dbModelKeys: readonly string[],
): readonly AvailabilityLine[] {
  if (dbModelKeys.length === 1) return index.linesByModel.get(dbModelKeys[0]!) ?? [];
  return index.lines.filter((line) => dbModelKeys.includes(line.model));
}

export function datesOfLines(
  index: AvailabilityIndex,
  lines: readonly AvailabilityLine[],
): string[] {
  const union = new Uint32Array((index.dates.length + 31) >>> 5);
  for (const line of lines) {
    for (let w = 0; w < union.length; w++) union[w]! |= line.dates[w]!;
  }
  const dates: string[] = [];
  for (let w = 0; w < union.length; w++) {
    for (let word = union[w]!; word !== 0; word &= word - 1) {
      dates.push(index.dates[(w << 5) | (31 - Math.clz32(word & -word))]!);
    }
  }
  return dates;
}
