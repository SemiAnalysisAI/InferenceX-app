'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { Heading } from '@/components/ui/heading';
import { exportToCsv } from '@/lib/csv-export';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml } from '@/lib/utils';
import type { InferenceData } from '../types';
import { buildPowerFits, MIN_FIT_POINTS } from '../utils/power-fit';
import { PowerPanelPlot, type PanelLine, type PanelMarker } from './PowerPanelPlot';

const STRINGS = {
  en: {
    title: 'Power versus output rate (least-squares fit)',
    xAxis: 'Output rate (tok/s per allocated GPU)',
    yAxis: 'Mean GPU power (W/GPU)',
    source: 'Source',
    intercept: 'P₀ (W/GPU)',
    tdpShare: 'P₀ ÷ TDP',
    slope: 'm (J/output token)',
    rSquared: 'R²',
    points: 'Points',
    range: 'Fitted range (tok/s/GPU)',
    tooFew: (count: number) =>
      `Not fitted: needs ${MIN_FIT_POINTS} distinct output rates, has ${count}.`,
    flat: 'Undefined: power did not vary',
    empty: 'No validated measured power with a known output rate is available for these filters.',
  },
  zh: {
    title: '功耗与输出速率（最小二乘拟合）',
    xAxis: '输出速率（每个已分配 GPU 的 tok/s）',
    yAxis: '平均 GPU 功耗（W/GPU）',
    source: '数据源',
    intercept: 'P₀（W/GPU）',
    tdpShare: 'P₀ ÷ TDP',
    slope: 'm（J/输出 token）',
    rSquared: 'R²',
    points: '点数',
    range: '拟合范围（tok/s/GPU）',
    tooFew: (count: number) =>
      `未拟合：需要 ${MIN_FIT_POINTS} 个不同的输出速率，当前只有 ${count} 个。`,
    flat: '无定义：功耗没有变化',
    empty: '当前筛选条件下没有同时具备有效实测功耗和已知输出速率的数据。',
  },
};

const watts = d3.format(',.0f');
const joules = d3.format(',.3f');
const rate = d3.format(',.1f');
const share = d3.format('.0%');
const rSquared = d3.format('.3f');
const EXTENSION_DASH = '4 4';

export default function PowerFitPanel({
  chartId,
  data,
  contextLabel,
  colorOf,
}: {
  chartId: string;
  data: InferenceData[];
  contextLabel?: string;
  colorOf: (sourceKey: string) => string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const fits = useMemo(() => buildPowerFits(data, locale), [data, locale]);
  const sectionId = `${chartId}-power-fit`;

  const markers: PanelMarker[] = fits.flatMap(({ source, observations }) =>
    observations.map((observation) => ({
      x: observation.x,
      y: observation.y,
      key: source.key,
      tooltip: [
        `<strong>${escapeHtml(source.label)}</strong>`,
        `c${observation.point.conc} · ${rate(observation.x)} tok/s/GPU`,
        `${watts(observation.y)} W/GPU`,
      ].join('<br/>'),
    })),
  );
  // Line keys become SVG class names, so they index the source rather than embed its key.
  const lines: PanelLine[] = fits.flatMap(({ source, fit }, index) => {
    if (!fit) return [];
    const at = (x: number) => ({ x, y: fit.intercept + fit.slope * x });
    const color = colorOf(source.key);
    return [
      { key: `source${index}-fit`, color, points: [at(fit.xMin), at(fit.xMax)] },
      ...(fit.xMin > 0
        ? [
            {
              key: `source${index}-extension`,
              color,
              dash: EXTENSION_DASH,
              points: [at(0), at(fit.xMin)],
            },
          ]
        : []),
    ];
  });

  const exportCsv = () => {
    exportToCsv(
      'InferenceX_power_fit',
      [
        'source',
        'p0_w_per_gpu',
        'tdp_w',
        'p0_over_tdp',
        'm_j_per_output_token',
        'r_squared',
        'n',
        'x_min_tok_s_per_gpu',
        'x_max_tok_s_per_gpu',
        'status',
      ],
      fits.map((entry) => {
        const { fit, tdpWatts } = entry;
        return [
          entry.source.label,
          fit?.intercept ?? null,
          tdpWatts,
          fit && tdpWatts ? fit.intercept / tdpWatts : null,
          fit?.slope ?? null,
          fit?.rSquared ?? null,
          entry.observations.length,
          fit?.xMin ?? null,
          fit?.xMax ?? null,
          entry.reason ?? 'fitted',
        ];
      }),
      contextLabel ? [contextLabel] : [],
    );
  };

  return (
    <section id={sectionId} className="min-w-0 space-y-3" data-testid="power-fit-panel">
      <Heading as="h3" level="card">
        {t.title}
      </Heading>
      <p className="export-only hidden text-sm text-muted-foreground">{contextLabel}</p>
      {fits.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <PowerPanelPlot
            chartId={sectionId}
            markers={markers}
            lines={lines}
            markerColor={colorOf}
            xLabel={t.xAxis}
            yLabel={t.yAxis}
            height={360}
          />
          <div className="min-w-0 overflow-x-auto">
            <table
              className="w-full min-w-[40rem] table-fixed break-words text-left text-sm"
              data-testid="power-fit-table"
            >
              <thead>
                <tr>
                  <th className="w-2/5 p-2">{t.source}</th>
                  <th className="p-2">{t.intercept}</th>
                  <th className="p-2">{t.tdpShare}</th>
                  <th className="p-2">{t.slope}</th>
                  <th className="p-2">{t.rSquared}</th>
                  <th className="p-2">{t.points}</th>
                  <th className="p-2">{t.range}</th>
                </tr>
              </thead>
              <tbody>
                {fits.map((entry) => {
                  const { fit, source, tdpWatts } = entry;
                  return (
                    <tr key={source.key} className="border-t" data-testid="power-fit-row">
                      <th className="p-2 align-top font-normal">
                        <span style={{ color: colorOf(source.key) }}>● </span>
                        <span className="break-all">{source.label}</span>
                      </th>
                      {fit ? (
                        <>
                          <td className="p-2 align-top">{watts(fit.intercept)}</td>
                          <td className="p-2 align-top">
                            {tdpWatts
                              ? `${share(fit.intercept / tdpWatts)} · ${watts(tdpWatts)} W`
                              : '—'}
                          </td>
                          <td className="p-2 align-top">{joules(fit.slope)}</td>
                          <td className="p-2 align-top">
                            {fit.rSquared === null ? t.flat : rSquared(fit.rSquared)}
                          </td>
                          <td className="p-2 align-top">{fit.n}</td>
                          <td className="p-2 align-top">
                            {rate(fit.xMin)}–{rate(fit.xMax)}
                          </td>
                        </>
                      ) : (
                        <td className="p-2 align-top text-muted-foreground" colSpan={6}>
                          {t.tooFew(new Set(entry.observations.map((o) => o.x)).size)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="max-h-0 overflow-hidden">
            <div id={`${sectionId}-export`} className="p-4" />
          </div>
          <ChartButtons
            chartId={sectionId}
            analyticsPrefix="power_fit"
            hideZoomReset
            onExportCsv={exportCsv}
          />
        </>
      )}
    </section>
  );
}
