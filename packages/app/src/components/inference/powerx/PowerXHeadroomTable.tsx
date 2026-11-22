'use client';

import { Download } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';

import type { InferenceData } from '@/components/inference/types';
import { track } from '@/lib/analytics/analytics';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { exportToCsv } from '@/lib/export/csv-export';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  buildHeadroomRows,
  HEADROOM_INTERACTIVITIES,
  headroomCsvRows,
  headroomExample,
} from '@/lib/power/headroom';

import { useUnofficialRun } from '@/providers/unofficial-run-provider';

import { PowerBasisPill } from './PowerBasisPill';

const STRINGS = {
  en: {
    title: 'Headroom by interactivity',
    chip: 'GPU',
    perUser: (x: number) => `${x} tok/s/user`,
    avg: 'Avg W',
    p90: 'P90 W',
    pct: '% TDP (P90)',
    headroom: 'Headroom',
    download: 'Download CSV',
    note: 'Interpolated along each GPU’s optimal points (monotone, in log interactivity). "—" means outside the measured range; nothing is extrapolated. Headroom = 1 − P90 / TDP.',
    key: 'Shaded band on the chart: headroom from each GPU’s P90 draw (dotted) up to its TDP.',
    empty: 'No GPU in this view has measured average and P90 power at two or more interactivities.',
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
    chip: 'GPU',
    perUser: (x: number) => `${x} tok/s/user`,
    avg: '平均 W',
    p90: 'P90 W',
    pct: 'TDP 占比（P90）',
    headroom: '余量',
    download: '下载 CSV',
    note: '沿各 GPU 的最优点插值（单调样条，按对数交互性）。“—”表示超出实测范围，不做外推。余量 = 1 − P90 / TDP。',
    key: '图中阴影：各 GPU 从 P90 功耗（虚线）到其 TDP 之间的余量。',
    empty: '当前视图中没有 GPU 在两个及以上交互性下同时具备实测平均功耗与 P90 功耗。',
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
    clipped: (hi: string) => ` ${hi} 是该 GPU 最快的实测点；300 不做外推。`,
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];
const int = (value: number) => Math.round(value).toLocaleString('en-US');
const pct = (value: number) => `${Math.round(value)}%`;

/**
 * The per-GPU summary under the Power draw chart shown as % of TDP: average
 * and P90 W per GPU, % of TDP and headroom at 25 / 50 / 100 / 300 tok/s/user,
 * read along each chip's frontier with the chart's own interpolation.
 */
export function PowerXHeadroomTable({
  points,
  overlayPoints,
  contextLabel,
}: {
  points: readonly InferenceData[];
  /** Unofficial-run overlay points: one row per chip line and run, in the run's color. */
  overlayPoints?: readonly InferenceData[];
  contextLabel?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { runIndexByUrl, unofficialRunInfos } = useUnofficialRun();
  const rows = useMemo(
    () =>
      buildHeadroomRows(
        points,
        overlayPoints && overlayPoints.length > 0
          ? { points: overlayPoints, runIndexByUrl, runInfos: unofficialRunInfos }
          : undefined,
      ),
    [points, overlayPoints, runIndexByUrl, unofficialRunInfos],
  );
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
    <section className="mt-4 min-w-0 space-y-2 px-1" data-testid="powerx-headroom">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t.title}</h3>
        {rows.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={exportCsv}
            data-testid="powerx-headroom-csv"
            className="no-export"
          >
            <Download aria-hidden />
            {t.download}
          </Button>
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
        <EmptyState bare className="py-4 text-xs" data-testid="powerx-headroom-empty">
          {t.empty}
        </EmptyState>
      ) : (
        <DataTable
          data={rows}
          columns={headroomColumns(t)}
          headerGroups={[
            { header: '', colSpan: 1 },
            ...HEADROOM_INTERACTIVITIES.map((x) => ({
              header: t.perUser(x),
              colSpan: METRICS.length,
              className: 'border-l border-border/60',
            })),
          ]}
          testId="powerx-headroom-table"
          analyticsPrefix="powerx_headroom"
          searchable={false}
          columnPresets={false}
          paginated={false}
          rowAttributes={(row) => ({
            'data-testid': 'powerx-headroom-row',
            'data-run-index': row.runIndex,
          })}
          scrollClassName="max-h-96"
          tableClassName="min-w-[52rem] text-xs"
        />
      )}
      <p className="text-xs text-muted-foreground">
        <span data-testid="powerx-headroom-key">{t.key}</span> {t.note}
      </p>
    </section>
  );
}

type HeadroomRow = ReturnType<typeof buildHeadroomRows>[number];
type HeadroomCell = NonNullable<HeadroomRow['cells'][number]>;

const METRICS = [
  {
    label: (t: Strings) => t.avg,
    pill: true,
    value: (cell: HeadroomCell) => cell.avgWatts,
    format: int,
  },
  {
    label: (t: Strings) => t.p90,
    pill: true,
    value: (cell: HeadroomCell) => cell.p90Watts,
    format: int,
  },
  {
    label: (t: Strings) => t.pct,
    pill: false,
    value: (cell: HeadroomCell) => cell.percentTdpP90,
    format: pct,
  },
  {
    label: (t: Strings) => t.headroom,
    pill: false,
    value: (cell: HeadroomCell) => cell.headroomPercent,
    format: pct,
  },
] as const;

/** The GPU column, then avg / P90 / % TDP / headroom under each interactivity group. */
function headroomColumns(t: Strings): DataTableColumn<HeadroomRow>[] {
  return [
    {
      header: t.chip,
      pinned: true,
      className: 'align-top whitespace-nowrap',
      sortValue: (row) => row.label,
      cell: (row) => (
        <>
          {row.runIndex !== undefined && (
            <span
              aria-hidden
              className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
              style={{ backgroundColor: overlayRunColor(row.runIndex) }}
            />
          )}
          {row.label}
        </>
      ),
    },
    ...HEADROOM_INTERACTIVITIES.flatMap((x, group) =>
      METRICS.map((metric, index): DataTableColumn<HeadroomRow> => ({
        header: `${t.perUser(x)} ${metric.label(t)}`,
        headerContent: (
          <>
            {metric.label(t)}
            {metric.pill && <PowerBasisPill tag="gpu" />}
          </>
        ),
        align: 'right',
        className: `align-top whitespace-nowrap ${index === 0 ? 'border-l border-border/60' : ''}`,
        sortValue: (row) => {
          const cell = row.cells[group];
          return cell ? metric.value(cell) : Number.NEGATIVE_INFINITY;
        },
        cell: (row) => {
          const cell = row.cells[group];
          return cell ? (
            metric.format(metric.value(cell))
          ) : (
            <span className="text-muted-foreground/60">—</span>
          );
        },
      })),
    ),
  ];
}
