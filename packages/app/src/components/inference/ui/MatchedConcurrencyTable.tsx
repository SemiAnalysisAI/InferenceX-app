'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { Heading } from '@/components/ui/heading';
import { exportToCsv } from '@/lib/csv-export';
import { useLocale } from '@/lib/use-locale';
import type { AggDataEntry, InferenceData } from '../types';
import {
  buildMatchedConcurrencyTable,
  type MatchedConcurrencySide,
} from '../utils/matched-concurrency';

const STRINGS = {
  en: {
    title: 'Matched concurrency (load diagnostic)',
    concurrency: 'Concurrency',
    baseline: 'Baseline',
    comparator: 'Comparator',
    change: 'Change',
    energy: 'J/output token',
    speed: 'tok/s/user',
    power: 'W/GPU',
    missing: 'Not measured',
    ambiguous: (count: number) => `${count} conflicting observations; none selected`,
    metricMissing: 'Energy not reported',
    energyChange: 'GPU energy',
    empty: 'Neither source has an observation with a positive concurrency.',
    unavailable: 'Choose two different available sources.',
  },
  zh: {
    title: '相同并发下的对照（负载诊断）',
    concurrency: '并发数',
    baseline: '基准',
    comparator: '对比对象',
    change: '变化',
    energy: 'J/输出 token',
    speed: 'tok/s/user',
    power: 'W/GPU',
    missing: '未测量',
    ambiguous: (count: number) => `${count} 个观测值相互冲突，均未采用`,
    metricMissing: '未报告能耗',
    energyChange: 'GPU 能耗',
    empty: '两个数据源都没有并发数为正的观测值。',
    unavailable: '请选择两个不同且可用的数据源。',
  },
};

const joules = d3.format(',.3f');
const watts = d3.format(',.0f');
const speed = d3.format(',.1f');
const signed = d3.format('+.1f');
const percent = (value: number | null) => (value === null ? '—' : `${signed(value)}%`);
const sideColumns = (side: MatchedConcurrencySide) =>
  side.status === 'observed'
    ? [
        side.status,
        side.values.joulesPerOutputToken,
        side.values.meanWattsPerGpu,
        side.values.interactivity,
        side.point.id ?? null,
        side.point.run_url ?? null,
      ]
    : [side.status, null, null, null, null, null];

export default function MatchedConcurrencyTable({
  chartId,
  data,
  baseline,
  comparator,
  interactivityField,
  sourceLabel,
}: {
  chartId: string;
  data: InferenceData[];
  baseline: string;
  comparator: string;
  interactivityField: keyof AggDataEntry;
  sourceLabel: (key: string) => string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const table = useMemo(
    () => buildMatchedConcurrencyTable(data, { baseline, comparator, interactivityField }),
    [data, baseline, comparator, interactivityField],
  );
  const cell = (side: MatchedConcurrencySide) => {
    if (side.status === 'missing')
      return <span className="text-muted-foreground">{t.missing}</span>;
    if (side.status === 'ambiguous')
      return <span className="text-muted-foreground">{t.ambiguous(side.points.length)}</span>;
    const { joulesPerOutputToken, meanWattsPerGpu, interactivity } = side.values;
    return (
      <>
        <strong>
          {joulesPerOutputToken === null ? t.metricMissing : joules(joulesPerOutputToken)}
        </strong>
        <span className="block text-xs text-muted-foreground">
          {meanWattsPerGpu === null ? '—' : watts(meanWattsPerGpu)} {t.power} ·{' '}
          {interactivity === null ? '—' : speed(interactivity)} {t.speed}
        </span>
      </>
    );
  };
  const sectionId = `${chartId}-matched-concurrency`;
  const exportCsv = () => {
    exportToCsv(
      `InferenceX_matched_concurrency`,
      [
        'concurrency',
        ...['baseline', 'comparator'].flatMap((prefix) => [
          `${prefix}_status`,
          `${prefix}_j_per_output_token`,
          `${prefix}_w_per_gpu`,
          `${prefix}_${String(interactivityField)}`,
          `${prefix}_point_id`,
          `${prefix}_run_url`,
        ]),
        'change_j_per_output_token_pct',
        'change_w_per_gpu_pct',
        'change_interactivity_pct',
      ],
      table.rows.map((row) => [
        row.concurrency,
        ...sideColumns(row.baseline),
        ...sideColumns(row.comparator),
        row.changePercent.joulesPerOutputToken,
        row.changePercent.meanWattsPerGpu,
        row.changePercent.interactivity,
      ]),
      [`baseline: ${sourceLabel(baseline)}`, `comparator: ${sourceLabel(comparator)}`],
    );
  };
  return (
    <section id={sectionId} className="min-w-0 space-y-3" data-testid="matched-concurrency-panel">
      <Heading as="h3" level="card">
        {t.title}
      </Heading>
      <p className="export-only hidden break-words text-sm" data-testid="matched-concurrency-pair">
        {t.baseline}: {sourceLabel(baseline)} → {t.comparator}: {sourceLabel(comparator)}
      </p>
      {table.reason ? (
        <p className="text-sm text-muted-foreground">{t.unavailable}</p>
      ) : table.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table
            className="w-full min-w-[34rem] table-fixed break-words text-left text-sm"
            data-testid="matched-concurrency-table"
          >
            <thead>
              <tr>
                <th className="w-28 whitespace-nowrap p-2">{t.concurrency}</th>
                <th className="p-2">
                  {t.baseline}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t.energy}
                  </span>
                </th>
                <th className="p-2">
                  {t.comparator}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t.energy}
                  </span>
                </th>
                <th className="p-2">
                  {t.change}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t.energyChange}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr
                  key={row.concurrency}
                  className="border-t"
                  data-testid={`matched-concurrency-row-${row.concurrency}`}
                >
                  <th className="p-2 font-medium">{row.concurrency}</th>
                  <td className="p-2 align-top">{cell(row.baseline)}</td>
                  <td className="p-2 align-top">{cell(row.comparator)}</td>
                  <td className="p-2 align-top">
                    <strong>{percent(row.changePercent.joulesPerOutputToken)}</strong>
                    <span className="block text-xs text-muted-foreground">
                      {t.power} {percent(row.changePercent.meanWattsPerGpu)} · {t.speed}{' '}
                      {percent(row.changePercent.interactivity)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="max-h-0 overflow-hidden">
        <div id={`${sectionId}-export`} className="p-4" />
      </div>
      <ChartButtons
        chartId={sectionId}
        analyticsPrefix="matched_concurrency"
        hideZoomReset
        onExportCsv={table.rows.length > 0 ? exportCsv : undefined}
      />
    </section>
  );
}
