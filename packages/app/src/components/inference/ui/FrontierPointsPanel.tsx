'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { Heading } from '@/components/ui/heading';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { exportToCsv } from '@/lib/csv-export';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import type { InferenceData } from '../types';
import { FRONTIER_EXPORT_HEADERS, frontierExportRow } from '../utils/frontier-points';
import { runAttemptFromUrl, runIdFromUrl } from '../utils/powerTimeline';
import { pointTopologyKey, topologyLabel } from '../utils/topology-filter';

const STRINGS = {
  en: {
    title: 'Frontier points',
    hardware: 'Hardware',
    config: 'Configuration',
    concurrency: 'Conc.',
    run: 'Run',
    date: 'Date',
    attempt: (attempt: number) => `attempt ${attempt}`,
    unofficial: 'unofficial',
    noRun: 'No run recorded',
  },
  zh: {
    title: '前沿点',
    hardware: '硬件',
    config: '配置',
    concurrency: '并发',
    run: '运行',
    date: '日期',
    attempt: (attempt: number) => `第 ${attempt} 次尝试`,
    unofficial: '非官方',
    noRun: '未记录运行',
  },
};

const number = d3.format(',.4~g');

export default function FrontierPointsPanel({
  chartId,
  eligible,
  frontier,
  xLabel,
  yLabel,
  overlayPoints,
  hardwareLabel,
  hardwareColor,
}: {
  chartId: string;
  /** Observations that competed: the chart's visible, frontier-eligible points. */
  eligible: readonly InferenceData[];
  frontier: readonly InferenceData[];
  xLabel: string;
  yLabel: string;
  overlayPoints: readonly InferenceData[];
  hardwareLabel: (point: InferenceData) => string;
  hardwareColor: (point: InferenceData) => string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { runIndexByUrl } = useUnofficialRun();
  const overlaySet = useMemo(() => new Set(overlayPoints), [overlayPoints]);
  const topologies = useMemo(() => [...new Set(eligible.map(pointTopologyKey))], [eligible]);
  const sectionId = `${chartId}-frontier-points`;
  const colorOf = (point: InferenceData) =>
    overlaySet.has(point)
      ? overlayRunColor(overlayRunIndex(point.run_url, runIndexByUrl))
      : hardwareColor(point);

  const exportCsv = () => {
    exportToCsv(
      'InferenceX_frontier_points',
      [...FRONTIER_EXPORT_HEADERS, 'unofficial'],
      frontier.map((point) => [...frontierExportRow(point), overlaySet.has(point)]),
      [`x: ${xLabel}`, `y: ${yLabel}`],
    );
  };

  return (
    <section
      id={sectionId}
      className="mt-4 min-w-0 space-y-3 border-t pt-4"
      data-testid="frontier-points-panel"
    >
      <Heading as="h3" level="card">
        {t.title}
      </Heading>
      <div className="max-h-96 min-w-0 overflow-auto">
        <table
          className="w-full min-w-[48rem] table-fixed break-words text-left text-sm"
          data-testid="frontier-points-table"
        >
          <thead className="sticky top-0 bg-background align-bottom">
            <tr>
              <th className="w-1/5 p-2">{t.hardware}</th>
              <th className="w-1/4 p-2">{t.config}</th>
              <th className="w-16 p-2">{t.concurrency}</th>
              <th className="p-2">{xLabel}</th>
              <th className="p-2">{yLabel}</th>
              <th className="p-2">{t.run}</th>
              <th className="w-24 p-2">{t.date}</th>
            </tr>
          </thead>
          <tbody>
            {frontier.map((point, index) => {
              const runId = runIdFromUrl(point.run_url);
              const attempt = runAttemptFromUrl(point.run_url);
              return (
                <tr
                  key={`${point.id ?? index}:${point.run_url ?? ''}`}
                  className="border-t"
                  data-testid="frontier-points-row"
                >
                  <th className="p-2 align-top font-normal">
                    <span style={{ color: colorOf(point) }}>● </span>
                    {hardwareLabel(point)}
                    {overlaySet.has(point) && (
                      <span className="block text-xs text-muted-foreground">{t.unofficial}</span>
                    )}
                  </th>
                  <td className="p-2 align-top">
                    {[
                      point.framework,
                      point.precision.toUpperCase(),
                      topologyLabel(pointTopologyKey(point), locale, topologies),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td className="p-2 align-top">{point.conc}</td>
                  <td className="p-2 align-top">{number(point.x)}</td>
                  <td className="p-2 align-top">{number(point.y)}</td>
                  <td className="p-2 align-top">
                    {point.run_url && runId ? (
                      <a
                        href={point.run_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-dotted"
                      >
                        {`run ${runId}`}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{t.noRun}</span>
                    )}
                    {attempt !== null && (
                      <span className="block text-xs text-muted-foreground">
                        {t.attempt(attempt)}
                      </span>
                    )}
                  </td>
                  <td className="p-2 align-top">{point.actualDate ?? point.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ChartButtons
        chartId={sectionId}
        analyticsPrefix="frontier_points"
        hideZoomReset
        hideImageExport
        onExportCsv={exportCsv}
      />
    </section>
  );
}
