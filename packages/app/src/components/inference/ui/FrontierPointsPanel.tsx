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
import {
  FRONTIER_EXPORT_HEADERS,
  frontierExportRow,
  frontierHardwareCounts,
  frontierScope,
} from '../utils/frontier-points';
import { runAttemptFromUrl, runIdFromUrl } from '../utils/powerTimeline';
import { pointTopologyKey, topologyLabel } from '../utils/topology-filter';

const STRINGS = {
  en: {
    title: 'Frontier points',
    scope: (frontier: number, eligible: number, sources: number, runs: number) =>
      `${frontier} of ${eligible} visible observations are on the frontier; they competed across ${sources} sources from ${runs} runs.`,
    direction: (x: string, y: string) => `Better: ${x} and ${y}.`,
    higher: (label: string) => `higher ${label}`,
    lower: (label: string) => `lower ${label}`,
    method:
      'One non-dominated set over every series visible on the chart, with the chart’s filters. Each point keeps its own run and recipe; nothing is interpolated or averaged.',
    mixed: (topologies: number, images: number) =>
      `The competing observations span ${topologies} topologies and ${images} images, so the frontier compares deployments as served, not one recipe.`,
    owners: 'Frontier points by hardware',
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
    scope: (frontier: number, eligible: number, sources: number, runs: number) =>
      `${eligible} 个可见观测值中有 ${frontier} 个位于前沿上；这些观测值来自 ${runs} 次运行中的 ${sources} 个数据源。`,
    direction: (x: string, y: string) => `更优方向：${x}、${y}。`,
    higher: (label: string) => `${label}更高`,
    lower: (label: string) => `${label}更低`,
    method:
      '在图表当前的筛选条件下，对图上全部可见系列统一计算一个非支配集合。每个点保留各自的运行和配置方案，不做插值或平均。',
    mixed: (topologies: number, images: number) =>
      `参与比较的观测值涉及 ${topologies} 种拓扑和 ${images} 个镜像，因此前沿比较的是各自的实际部署，而非同一配置方案。`,
    owners: '各硬件的前沿点数',
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
  maximizeX,
  maximizeY,
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
  maximizeX: boolean;
  maximizeY: boolean;
  overlayPoints: readonly InferenceData[];
  hardwareLabel: (point: InferenceData) => string;
  hardwareColor: (point: InferenceData) => string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { runIndexByUrl } = useUnofficialRun();
  const overlaySet = useMemo(() => new Set(overlayPoints), [overlayPoints]);
  const scope = useMemo(() => frontierScope(eligible), [eligible]);
  const owners = useMemo(() => frontierHardwareCounts(frontier), [frontier]);
  const topologies = useMemo(() => [...new Set(eligible.map(pointTopologyKey))], [eligible]);
  const sectionId = `${chartId}-frontier-points`;
  const colorOf = (point: InferenceData) =>
    overlaySet.has(point)
      ? overlayRunColor(overlayRunIndex(point.run_url, runIndexByUrl))
      : hardwareColor(point);
  const labelFor = (hwKey: string) => {
    const point = frontier.find((entry) => entry.hwKey === hwKey);
    return point ? hardwareLabel(point) : hwKey;
  };

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
      <p className="text-sm" data-testid="frontier-points-scope">
        {t.scope(frontier.length, scope.eligible, scope.sources, scope.runs)}{' '}
        {t.direction(
          maximizeX ? t.higher(xLabel) : t.lower(xLabel),
          maximizeY ? t.higher(yLabel) : t.lower(yLabel),
        )}
      </p>
      <p className="text-xs text-muted-foreground">{t.method}</p>
      {(scope.topologies > 1 || scope.images > 1) && (
        <p className="text-xs text-muted-foreground" data-testid="frontier-points-mixed">
          {t.mixed(scope.topologies, scope.images)}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">{t.owners}:</span>
        {owners.map(({ hwKey, count }) => (
          <span key={hwKey} data-testid="frontier-points-owner">
            {labelFor(hwKey)} ×{count}
          </span>
        ))}
      </p>
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
