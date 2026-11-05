'use client';

import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { track } from '@/lib/analytics/analytics';
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
    csv: 'Download CSV',
    hardware: 'Hardware',
    gpus: 'GPUs (part. / alloc.)',
    meets: (seconds: string) => `Meets ${seconds} s`,
    power: 'Avg W',
    valid: 'Valid',
    unofficial: 'Unofficial run',
    empty: 'No measured data for this selection',
  },
  zh: {
    title: '代表性部署',
    open: (label: string) => `查看 ${label} 的遥测数据`,
    deadline: '截止时间（s）',
    csv: '下载 CSV',
    hardware: '硬件',
    gpus: 'GPU（参与 / 分配）',
    meets: (seconds: string) => `${seconds} s 内完成`,
    power: '平均功率（W）',
    valid: '有效',
    unofficial: '非官方运行',
    empty: '当前选择没有实测数据',
  },
};

export default function VideoResultsTable({
  rows,
  state,
  color,
  onOpen,
  onDeadlineChange,
  csvHref,
}: {
  rows: ResultCell[];
  state: ResultsState;
  color: (cell: ResultCell) => string;
  onOpen: (cell: ResultCell) => void;
  onDeadlineChange: (seconds: number) => void;
  csvHref: string;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const head = [
    s.hardware,
    s.gpus,
    'P50 s',
    'P90 s',
    s.meets(n(state.deadlineSeconds)),
    'video-s / hr',
    '$ / video',
    '$ / video-s',
    'kJ / clip',
    s.power,
    s.valid,
  ];
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="video-results-table-title">
      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="flex-1">
          <Heading as="h3" level="label" id="video-results-table-title" className="font-semibold">
            {s.title}
          </Heading>
        </div>
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
        <a
          className="text-xs underline"
          href={csvHref}
          download="videogenx-results.csv"
          data-testid="results-table-csv"
          onClick={() => track('video_results_csv_downloaded', { source: 'table' })}
        >
          {s.csv}
        </a>
      </div>
      <div className={styles.scroll}>
        <table className={`${styles.table} text-xs`} data-testid="results-table">
          <thead>
            <tr>
              {head.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={head.length} className="text-muted-foreground">
                  {s.empty}
                </td>
              </tr>
            ) : (
              rows.map((cell) => {
                const { point } = cell;
                const cost = cell.cost[state.costBasis];
                const label = `${hardwareLabel(point.hardwareKey ?? '')}${cell.overlay ? ` · ${s.unofficial} #${point.runId}` : ''}`;
                return (
                  <tr
                    key={resultsPointKey(cell)}
                    data-testid="results-row"
                    data-hardware={point.hardwareKey}
                    data-overlay={cell.overlay}
                    data-point={resultsPointKey(cell)}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => onOpen(cell)}
                  >
                    <td>
                      <button
                        type="button"
                        aria-label={s.open(label)}
                        className="flex items-center gap-2 text-left underline-offset-2 hover:underline"
                      >
                        <span className={styles.dot} style={{ background: color(cell) }} />
                        {label}
                      </button>
                    </td>
                    <td>
                      {n(point.participating, 0)} / {n(point.allocated, 0)}
                    </td>
                    <td>{n(point.p50, 1)}</td>
                    <td>{n(point.p90, 1)}</td>
                    <td>
                      {cell.deadlineAttainment === null
                        ? '—'
                        : `${n(cell.deadlineAttainment * 100, 0)}%`}
                    </td>
                    <td>{n(point.videoSecondsPerHour, 0)}</td>
                    <td data-value={cost?.perVideo}>{n(cost?.perVideo, 4)}</td>
                    <td data-value={cost?.perVideoSecond}>{n(cost?.perVideoSecond, 4)}</td>
                    <td>{n(cell.joulesPerClip === null ? null : cell.joulesPerClip / 1000, 1)}</td>
                    <td>{n(point.avgPowerW, 0)}</td>
                    <td>
                      {n(point.valid, 0)} / {n(point.scheduled, 0)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
