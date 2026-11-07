'use client';

import { useMemo } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/lib/i18n/use-locale';
import { hardwareLabel } from './hardware';
import type { ResultCell, ResultsState } from './results';
import { resultsPointKey } from './results-chart';
import { resultsNumber as n } from './VideoResultsCharts';
import styles from './results.module.css';

const STRINGS = {
  en: {
    title: 'Representative deployments',
    open: (label: string) => `Open telemetry for ${label}`,
    deadline: 'Deadline (s)',
    hardware: 'Hardware',
    gpus: 'GPUs (part. / alloc.)',
    meets: (seconds: string) => `Meets ${seconds} s`,
    power: 'Avg W',
    valid: 'Valid',
    unofficial: 'Unofficial run',
  },
  zh: {
    title: '代表性部署',
    open: (label: string) => `查看 ${label} 的遥测数据`,
    deadline: '截止时间（s）',
    hardware: '硬件',
    gpus: 'GPU（参与 / 分配）',
    meets: (seconds: string) => `${seconds} s 内完成`,
    power: '平均功率（W）',
    valid: '有效',
    unofficial: '非官方运行',
  },
};

/** Sorts a missing value last in either direction, as DataTable expects. */
const sortable = (value: number | null | undefined) => value ?? (null as unknown as number);

export default function VideoResultsTable({
  rows,
  state,
  color,
  onOpen,
  onDeadlineChange,
}: {
  rows: ResultCell[];
  state: ResultsState;
  color: (cell: ResultCell) => string;
  onOpen: (cell: ResultCell) => void;
  onDeadlineChange: (seconds: number) => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const columns = useMemo<DataTableColumn<ResultCell>[]>(() => {
    const label = (cell: ResultCell) =>
      `${hardwareLabel(cell.point.hardwareKey ?? '')}${cell.overlay ? ` · ${s.unofficial} #${cell.point.runId}` : ''}`;
    const number = (
      header: string,
      value: (cell: ResultCell) => number | null | undefined,
      digits: number,
    ): DataTableColumn<ResultCell> => ({
      header,
      align: 'right',
      // The raw value lets tests compare the cell to the shared projection exactly.
      cell: (cell) => <span data-value={value(cell) ?? undefined}>{n(value(cell), digits)}</span>,
      sortValue: (cell) => sortable(value(cell)),
      className: 'whitespace-nowrap',
    });
    return [
      {
        header: s.hardware,
        pinned: true,
        sortValue: label,
        cell: (cell) => (
          <button
            type="button"
            aria-label={s.open(label(cell))}
            data-testid="results-row"
            data-hardware={cell.point.hardwareKey}
            data-overlay={cell.overlay}
            data-point={resultsPointKey(cell)}
            className="flex cursor-pointer items-center gap-2 text-left font-medium underline-offset-2 hover:underline"
            onClick={() => onOpen(cell)}
          >
            <span className={styles.dot} style={{ background: color(cell) }} />
            {label(cell)}
          </button>
        ),
      },
      {
        header: s.gpus,
        align: 'right',
        cell: ({ point }) => `${n(point.participating, 0)} / ${n(point.allocated, 0)}`,
        sortValue: ({ point }) => sortable(point.participating),
        className: 'whitespace-nowrap',
      },
      number('P50 s', ({ point }) => point.p50, 1),
      number('P90 s', ({ point }) => point.p90, 1),
      {
        header: s.meets(n(state.deadlineSeconds)),
        align: 'right',
        cell: (cell) =>
          cell.deadlineAttainment === null ? '—' : `${n(cell.deadlineAttainment * 100, 0)}%`,
        sortValue: (cell) => sortable(cell.deadlineAttainment),
        className: 'whitespace-nowrap',
      },
      number('video-s / hr', ({ point }) => point.videoSecondsPerHour, 0),
      number('$ / video', (cell) => cell.cost[state.costBasis]?.perVideo, 4),
      number('$ / video-s', (cell) => cell.cost[state.costBasis]?.perVideoSecond, 4),
      number(
        'kJ / clip',
        (cell) => (cell.joulesPerClip === null ? null : cell.joulesPerClip / 1000),
        1,
      ),
      number(s.power, ({ point }) => point.avgPowerW, 0),
      {
        header: s.valid,
        align: 'right',
        cell: ({ point }) => `${n(point.valid, 0)} / ${n(point.scheduled, 0)}`,
        sortValue: ({ point }) => sortable(point.valid),
        className: 'whitespace-nowrap',
      },
    ];
  }, [s, state.costBasis, state.deadlineSeconds, color, onOpen]);
  return (
    <section className="flex min-w-0 flex-col gap-1" aria-labelledby="video-results-table-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Heading as="h3" level="card" id="video-results-table-title">
          {s.title}
        </Heading>
        <div className="flex items-center gap-2">
          <Label htmlFor="results-deadline" className="text-xs">
            {s.deadline}
          </Label>
          <Input
            id="results-deadline"
            data-testid="results-deadline"
            type="number"
            min="1"
            className="h-8 w-20"
            value={state.deadlineSeconds}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value) && value > 0) onDeadlineChange(value);
            }}
          />
        </div>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        testId="results-table"
        analyticsPrefix="video_results_table"
        searchable={false}
      />
    </section>
  );
}
