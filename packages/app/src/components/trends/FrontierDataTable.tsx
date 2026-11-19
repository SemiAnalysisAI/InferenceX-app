'use client';

import { ChevronDown } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { track } from '@/lib/analytics/analytics';
import { formatLargeNumber } from '@/lib/charts/chart-rendering';
import { useLocale } from '@/lib/i18n/use-locale';

import type { FrontierSeriesStyle } from './FrontierChart';
import {
  pooledFrontier,
  seriesFrontiersAt,
  type FrontierHistory,
  type FrontierVertex,
} from './frontier-history-core';

const STRINGS = {
  en: {
    show: (count: number) => `Show frontier data (${count} points)`,
    hide: 'Hide frontier data',
    series: 'Series',
    config: 'Configuration',
    interactivity: 'Interactivity',
    concurrency: 'Concurrency',
    precision: 'Precision',
    measured: 'Measured',
    run: 'Run',
    open: 'Open',
  },
  zh: {
    show: (count: number) => `查看前沿数据（${count} 个点）`,
    hide: '收起前沿数据',
    series: '序列',
    config: '配置',
    interactivity: '交互性',
    concurrency: '并发',
    precision: '精度',
    measured: '测量日期',
    run: '运行记录',
    open: '打开',
  },
} as const;

interface Row {
  key: string;
  vertex: FrontierVertex;
}

/**
 * The measured points behind the curves on screen at the current date: the pooled frontier,
 * or each compared series' own frontier, with the configuration and run that produced them.
 */
export default function FrontierDataTable({
  history,
  dateIndex,
  keys,
  pooled,
  styles,
  configLabel,
  yLabel,
}: {
  history: FrontierHistory;
  dateIndex: number;
  keys: readonly string[];
  pooled: boolean;
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  configLabel: (config: string) => string;
  yLabel: string;
}) {
  const t = STRINGS[useLocale()];
  const [open, setOpen] = useState(false);
  const rows = useMemo((): Row[] => {
    const frontiers = seriesFrontiersAt(history, dateIndex);
    for (const key of frontiers.keys()) if (!keys.includes(key)) frontiers.delete(key);
    return pooled
      ? pooledFrontier(frontiers, history.higherIsBetter).map((vertex) => ({
          key: vertex.key,
          vertex,
        }))
      : [...frontiers].flatMap(([key, vertices]) => vertices.map((vertex) => ({ key, vertex })));
  }, [history, dateIndex, keys, pooled]);

  const columns = useMemo(
    (): DataTableColumn<Row>[] => [
      {
        header: t.series,
        importance: 'key',
        pinned: true,
        sortValue: (row) => styles.get(row.key)?.label ?? row.key,
        cell: (row) => (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: styles.get(row.key)?.color ?? 'var(--muted-foreground)' }}
            />
            {styles.get(row.key)?.label ?? row.key}
          </span>
        ),
      },
      {
        header: t.config,
        importance: 'key',
        sortValue: (row) => configLabel(row.vertex.config),
        cell: (row) => configLabel(row.vertex.config),
      },
      {
        header: `${t.interactivity} (tok/s/user)`,
        align: 'right',
        importance: 'key',
        sortValue: (row) => row.vertex.x,
        cell: (row) => row.vertex.x.toFixed(1),
      },
      {
        header: yLabel,
        align: 'right',
        importance: 'key',
        sortValue: (row) => row.vertex.y,
        cell: (row) => formatLargeNumber(row.vertex.y),
      },
      {
        header: t.concurrency,
        align: 'right',
        importance: 'secondary',
        sortValue: (row) => row.vertex.conc,
        cell: (row) => row.vertex.conc,
      },
      {
        header: t.precision,
        importance: 'secondary',
        cell: (row) => row.vertex.precision.toUpperCase(),
      },
      {
        header: t.measured,
        importance: 'secondary',
        sortValue: (row) => row.vertex.measured,
        cell: (row) => row.vertex.measured,
      },
      {
        header: t.run,
        importance: 'secondary',
        cell: (row) =>
          row.vertex.runUrl ? (
            <a
              href={row.vertex.runUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              {t.open}
            </a>
          ) : (
            '—'
          ),
      },
    ],
    [t, styles, configLabel, yLabel],
  );

  return (
    <section className="px-1 pt-4">
      <button
        type="button"
        aria-expanded={open}
        data-testid="frontier-data-toggle"
        onClick={() => {
          setOpen(!open);
          track('historical_frontier_data_toggled', { enabled: !open });
        }}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? t.hide : t.show(rows.length)}
      </button>
      {open && (
        <div className="pt-3">
          <DataTable
            data={rows}
            columns={columns}
            testId="frontier-data-table"
            analyticsPrefix="historical_frontier_data"
          />
        </div>
      )}
    </section>
  );
}
