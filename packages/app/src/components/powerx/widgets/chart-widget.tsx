'use client';

import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

import { PowerPanelPlot } from '@/components/inference/ui/PowerPanelPlot';
import { track } from '@/lib/analytics/analytics';
import { generateVendorColors } from '@/lib/charts/dynamic-colors';
import {
  CHART_PRESET,
  type ChartMetric,
  type ChartViewResponse,
  chartViewUrl,
  decodeChartMetric,
  encodeChartMetric,
  toPanelData,
} from '@/lib/powerx/chart-widget';
import { escapeHtml } from '@/lib/shared/utils';
import { isDarkTheme } from '@/lib/themes/themes';

import {
  ChipRow,
  CopyButton,
  OutputBadge,
  OutputHeader,
  useWidgetHash,
  WidgetCard,
  WidgetNote,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    metric: 'Metric',
    metrics: {
      energy: { label: 'Energy per token', subtitle: 'J per output token, lower is better' },
      power: { label: 'Power draw', subtitle: 'P90 W per GPU, upper envelope' },
    },
    badge: (count: number) => `Measured · ${count} points · live`,
    badgeTitle: 'Validated telemetry points, fetched from the views API when the page opens',
    preset: `${CHART_PRESET.model} · ${CHART_PRESET.sequence} · ${CHART_PRESET.precisions.toUpperCase()}`,
    copy: 'Copy API URL',
    loading: 'Loading measured points…',
    empty: 'No validated power points for this pair in this data set.',
    failed: 'The views API did not answer; reload to try again.',
    xLabel: 'P90 interactivity (tok/s/user)',
    yLabels: { energy: 'J per output token', power: 'P90 W per GPU' },
    tooltip: (label: string, concurrency: number, date: string) =>
      `${label} · c${concurrency} · ${date}`,
  },
  zh: {
    metric: '指标',
    metrics: {
      energy: { label: '每 token 能量', subtitle: '每输出 token 焦耳数，越低越好' },
      power: { label: '功耗', subtitle: '每 GPU P90 瓦特数，上包络线' },
    },
    badge: (count: number) => `实测 · ${count} 个数据点 · 实时`,
    badgeTitle: '通过校验的遥测数据点，页面打开时从 views API 获取',
    preset: `${CHART_PRESET.model} · ${CHART_PRESET.sequence} · ${CHART_PRESET.precisions.toUpperCase()}`,
    copy: '复制 API URL',
    loading: '正在加载实测数据点…',
    empty: '当前数据集中，这一对硬件没有通过校验的功耗数据点。',
    failed: 'views API 没有响应，请刷新页面重试。',
    xLabel: 'P90 交互性（tok/s/user）',
    yLabels: { energy: '每输出 token 焦耳数', power: '每 GPU P90 瓦特数' },
    tooltip: (label: string, concurrency: number, date: string) =>
      `${label} · c${concurrency} · ${date}`,
  },
} as const;

const HASH_KEY = 'ch';

type Fetched =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ok'; data: ChartViewResponse };

export function ChartWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [metric, setMetric] = useWidgetHash<ChartMetric>(
    HASH_KEY,
    encodeChartMetric,
    decodeChartMetric,
  );
  const [responses, setResponses] = useState<Partial<Record<ChartMetric, Fetched>>>({});
  const theme = isDarkTheme(useTheme().resolvedTheme) ? 'dark' : 'light';

  useEffect(() => {
    if (responses[metric]) return;
    let cancelled = false;
    setResponses((previous) => ({ ...previous, [metric]: { status: 'loading' } }));
    fetch(chartViewUrl(metric))
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as ChartViewResponse;
      })
      .then((data) => {
        if (!cancelled)
          setResponses((previous) => ({ ...previous, [metric]: { status: 'ok', data } }));
      })
      .catch(() => {
        if (!cancelled)
          setResponses((previous) => ({ ...previous, [metric]: { status: 'failed' } }));
      });
    return () => {
      cancelled = true;
    };
    // Each metric is fetched once; `responses` is the cache being filled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  const fetched = responses[metric] ?? { status: 'loading' };
  const panel = useMemo(() => {
    if (fetched.status !== 'ok') return null;
    const keys = fetched.data.series.map((series) => series.hwKey);
    const colors = generateVendorColors(keys, theme);
    return toPanelData(
      fetched.data,
      (key) => colors[key] ?? 'currentColor',
      (series, point) =>
        `<strong>${escapeHtml(series.label)}</strong><br/>${escapeHtml(
          t.tooltip(series.deployment, point.concurrency, point.date),
        )}<br/>${point.x.toFixed(1)} tok/s/user · ${point.y.toFixed(2)} ${fetched.data.metric.unit ?? ''}`,
    );
  }, [fetched, theme, t]);

  return (
    <WidgetCard name="chart" alt={alt}>
      <ChipRow<ChartMetric>
        label={t.metric}
        value={metric}
        onChange={(next) => {
          setMetric(next);
          track('powerx_tutorial_chart_metric', { value: next });
        }}
        groups={[
          {
            options: (['energy', 'power'] as const).map((key) => ({
              value: key,
              ...t.metrics[key],
            })),
          },
        ]}
      />
      <OutputHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <OutputBadge tone="measured" title={t.badgeTitle}>
            {t.badge(panel?.markers.length ?? 0)}
          </OutputBadge>
          <span className="font-mono text-xs text-muted-foreground">{t.preset}</span>
        </div>
        <CopyButton
          text={`${typeof window === 'undefined' ? '' : window.location.origin}${chartViewUrl(metric)}`}
          label={t.copy}
          locale={locale}
          event="powerx_tutorial_chart_url_copied"
        />
      </OutputHeader>
      {panel && panel.markers.length > 0 ? (
        <div className="px-2 py-2">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
            {panel.lines.map((line, index) => (
              <li key={line.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
                {panel.legend[index]?.label}
              </li>
            ))}
          </ul>
          <PowerPanelPlot
            chartId={`powerx-tutorial-chart-${metric}`}
            markers={panel.markers}
            lines={panel.lines}
            markerColor={(key) =>
              panel.lines.find((line) => line.key === key)?.color ?? 'currentColor'
            }
            xLabel={t.xLabel}
            yLabel={t.yLabels[metric]}
            yLog={metric === 'energy'}
            height={320}
          />
        </div>
      ) : (
        <WidgetNote>
          {fetched.status === 'loading'
            ? t.loading
            : fetched.status === 'failed'
              ? t.failed
              : t.empty}
        </WidgetNote>
      )}
    </WidgetCard>
  );
}
