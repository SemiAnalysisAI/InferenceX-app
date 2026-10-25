'use client';

import { Download } from 'lucide-react';
import { useMemo } from 'react';

import type { InferenceData } from '@/components/inference/types';
import { track } from '@/lib/analytics/analytics';
import { exportToCsv } from '@/lib/export/csv-export';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  buildHeadroomRows,
  HEADROOM_INTERACTIVITIES,
  headroomCsvRows,
  headroomExample,
} from '@/lib/power/headroom';

import { PowerBasisPill } from './PowerBasisPill';

const STRINGS = {
  en: {
    title: 'Headroom by interactivity',
    chip: 'Chip',
    perUser: (x: number) => `${x} tok/s/user`,
    avg: 'Avg W',
    p90: 'P90 W',
    pct: '% TDP (P90)',
    headroom: 'Headroom',
    download: 'Download CSV',
    note: 'Interpolated along each chip’s optimal points (monotone, in log interactivity). "—" means outside the measured range; nothing is extrapolated. Headroom = 1 − P90 / TDP.',
    empty:
      'No chip in this view has measured average and P90 power at two or more interactivities.',
    example: (
      chip: string,
      hi: string,
      lo: string,
      hiPct: string,
      loPct: string,
      hiHead: string,
      loHead: string,
    ) =>
      `Example: ${chip} at ${hi} → ${lo} tok/s/user goes from ${hiPct}% to ${loPct}% of TDP (P90 draw), so headroom shrinks from ${hiHead}% to ${loHead}%.`,
    clipped: (hi: string) => ` ${hi} is its fastest measured point; 300 is not extrapolated.`,
  },
  zh: {
    title: '按交互性划分的功耗余量',
    chip: '芯片',
    perUser: (x: number) => `${x} tok/s/user`,
    avg: '平均 W',
    p90: 'P90 W',
    pct: 'TDP 占比（P90）',
    headroom: '余量',
    download: '下载 CSV',
    note: '沿各芯片的最优点插值（单调样条，按对数交互性）。“—”表示超出实测范围，不做外推。余量 = 1 − P90 / TDP。',
    empty: '当前视图中没有芯片在两个及以上交互性下同时具备实测平均功耗与 P90 功耗。',
    example: (
      name: string,
      hi: string,
      lo: string,
      hiPct: string,
      loPct: string,
      hiHead: string,
      loHead: string,
    ) =>
      `示例：${name} 从 ${hi} 降到 ${lo} tok/s/user 时，P90 功耗占 TDP 的比例从 ${hiPct}% 升至 ${loPct}%，余量从 ${hiHead}% 缩小到 ${loHead}%。`,
    clipped: (hi: string) => ` ${hi} 是该芯片最快的实测点；300 不做外推。`,
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];
const int = (value: number) => Math.round(value).toLocaleString('en-US');
const pct = (value: number) => `${Math.round(value)}%`;

/**
 * The per-chip summary under the Power draw chart shown as % of TDP: average
 * and P90 W per chip, % of TDP and headroom at 25 / 50 / 100 / 300 tok/s/user,
 * read along each chip's frontier with the chart's own interpolation.
 */
export function PowerXHeadroomTable({
  points,
  contextLabel,
}: {
  points: readonly InferenceData[];
  contextLabel?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const rows = useMemo(() => buildHeadroomRows(points), [points]);
  const example = useMemo(() => headroomExample(points, rows), [points, rows]);
  const exportCsv = () => {
    const csv = headroomCsvRows(rows);
    exportToCsv(
      'InferenceX_powerx_headroom_by_interactivity',
      Object.keys(csv[0] ?? { chip: '' }),
      csv.map((row) => Object.values(row)),
      contextLabel ? [contextLabel] : [],
    );
    track('inference_powerx_headroom_exported', { rows: rows.length });
  };
  return (
    <section className="mt-4 min-w-0 space-y-2" data-testid="powerx-headroom">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            data-testid="powerx-headroom-csv"
            className="no-export inline-flex min-h-11 items-center gap-1 rounded-md border border-border/60 px-3 text-xs font-medium text-foreground hover:bg-muted md:min-h-8"
          >
            <Download className="size-3.5" aria-hidden />
            {t.download}
          </button>
        )}
      </div>
      {example && (
        <p className="text-xs text-muted-foreground" data-testid="powerx-headroom-example">
          {t.example(
            example.row.label,
            int(example.high.interactivity),
            int(example.low.interactivity),
            int(example.high.percentTdpP90),
            int(example.low.percentTdpP90),
            int(example.high.headroomPercent),
            int(example.low.headroomPercent),
          )}
          {example.clippedHigh && t.clipped(int(example.high.interactivity))}
          <PowerBasisPill tag="gpu" />
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="powerx-headroom-empty">
          {t.empty}
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table
            className="w-full min-w-[52rem] text-left text-xs tabular-nums"
            data-testid="powerx-headroom-table"
          >
            <thead>
              <tr className="border-b border-border/60">
                <th rowSpan={2} className="py-1 pr-2 align-bottom font-medium">
                  {t.chip}
                </th>
                {HEADROOM_INTERACTIVITIES.map((x) => (
                  <th
                    key={x}
                    colSpan={4}
                    className="border-l border-border/60 px-2 py-1 text-center font-medium"
                  >
                    {t.perUser(x)}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border/60 text-muted-foreground">
                {HEADROOM_INTERACTIVITIES.map((x) => (
                  <HeadroomGroupHeaders key={x} t={t} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-border/40"
                  data-testid="powerx-headroom-row"
                >
                  <td className="py-1 pr-2 font-medium whitespace-nowrap">{row.label}</td>
                  {row.cells.map((cell, index) =>
                    cell ? (
                      <HeadroomCells
                        key={index}
                        avg={int(cell.avgWatts)}
                        p90={int(cell.p90Watts)}
                        percent={pct(cell.percentTdpP90)}
                        headroom={pct(cell.headroomPercent)}
                      />
                    ) : (
                      <HeadroomCells key={index} avg="—" p90="—" percent="—" headroom="—" muted />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t.note}</p>
    </section>
  );
}

function HeadroomGroupHeaders({ t }: { t: Strings }) {
  return (
    <>
      <th className="border-l border-border/60 px-2 py-1 font-normal whitespace-nowrap">
        {t.avg}
        <PowerBasisPill tag="gpu" />
      </th>
      <th className="px-2 py-1 font-normal whitespace-nowrap">
        {t.p90}
        <PowerBasisPill tag="gpu" />
      </th>
      <th className="px-2 py-1 font-normal whitespace-nowrap">{t.pct}</th>
      <th className="px-2 py-1 font-normal whitespace-nowrap">{t.headroom}</th>
    </>
  );
}

function HeadroomCells({
  avg,
  p90,
  percent,
  headroom,
  muted = false,
}: {
  avg: string;
  p90: string;
  percent: string;
  headroom: string;
  muted?: boolean;
}) {
  const cls = `px-2 py-1 ${muted ? 'text-muted-foreground/60' : ''}`;
  return (
    <>
      <td className={`border-l border-border/60 ${cls}`}>{avg}</td>
      <td className={cls}>{p90}</td>
      <td className={cls}>{percent}</td>
      <td className={cls}>{headroom}</td>
    </>
  );
}
