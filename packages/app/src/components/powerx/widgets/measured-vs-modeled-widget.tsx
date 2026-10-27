'use client';

import { useMemo, useRef, useState } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import {
  decodeMmView,
  encodeMmView,
  frontierLine,
  MM_GPUS,
  MM_VIEWS,
  mmDashboardUrl,
  mmViewUrl,
  type MmView,
  type PairedPoint,
  type PairedSeries,
  pairSeries,
} from '@/lib/powerx/measured-vs-modeled';
import { cn } from '@/lib/shared/utils';

import { inViewAttr, motionVars, useInView } from './motion';
import {
  Chips,
  CopyButton,
  GrammarLegend,
  GrammarSwatch,
  useView,
  useWidgetHash,
  WidgetFrame,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    view: 'Energy per output token',
    views: {
      measured: 'Measured GPU',
      modeled: 'Modeled facility',
    },
    viewTitles: {
      measured: 'Joules per output token from GPU telemetry alone',
      modeled:
        'The same points scaled by the power model: facility watts per GPU over measured watts',
    },
    x: 'Interactivity (tok/s/user)',
    y: 'J per output token, log',
    preset: 'DeepSeek-V4-Pro · AgentX traces · FP4',
    open: 'Open in PowerX',
    copy: 'Copy API URL',
    loading: 'Loading validated points…',
    empty: 'No validated power points for this pair in this data set.',
    failed: 'The views API did not answer; reload to try again.',
    tooltip: {
      measured: 'Measured GPU',
      modeled: 'Modeled facility',
      ratio: (ratio: number) => `×${ratio.toFixed(2)}`,
      point: (x: number, concurrency: number) =>
        `${x.toFixed(1)} tok/s/user · concurrency ${concurrency}`,
    },
    aria: (count: number) =>
      `${count} validated points; the modeled facility curve sits above the measured GPU curve with the same shape`,
  },
  zh: {
    view: '每输出 token 能量',
    views: {
      measured: '实测 GPU',
      modeled: '建模数据中心',
    },
    viewTitles: {
      measured: '仅由 GPU 遥测得到的每输出 token 焦耳数',
      modeled: '同一批数据点按功耗模型换算：乘以每 GPU 数据中心瓦特数 ÷ 实测瓦特数',
    },
    x: '交互性（tok/s/user）',
    y: '每输出 token 焦耳数，对数坐标',
    preset: 'DeepSeek-V4-Pro · AgentX traces · FP4',
    open: '在 PowerX 中打开',
    copy: '复制 API URL',
    loading: '正在加载通过校验的数据点…',
    empty: '当前数据集中，这一对硬件没有通过校验的功耗数据点。',
    failed: 'views API 没有响应，请刷新页面重试。',
    tooltip: {
      measured: '实测 GPU',
      modeled: '建模数据中心',
      ratio: (ratio: number) => `×${ratio.toFixed(2)}`,
      point: (x: number, concurrency: number) => `${x.toFixed(1)} tok/s/user · 并发 ${concurrency}`,
    },
    aria: (count: number) =>
      `${count} 个通过校验的数据点；建模数据中心曲线位于实测 GPU 曲线之上，形状相同`,
  },
} as const;

const HASH_KEY = 'mm';
const MARGIN = { top: 16, right: 20, bottom: 42, left: 50 };
/** Lines draw over 900 ms once the chart is on screen; the points fade in as they finish. */
const DRAW_MS = 900;
const POINTS_DELAY_MS = 650;
const TOGGLE_FADE =
  'transition-opacity duration-500 ease-[var(--motion-ease-enter)] motion-reduce:transition-none';

function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (
    let exponent = Math.floor(Math.log10(min));
    exponent <= Math.ceil(Math.log10(max));
    exponent++
  ) {
    for (const mantissa of [1, 2, 5]) {
      const value = mantissa * 10 ** exponent;
      if (value >= min && value <= max) ticks.push(value);
    }
  }
  return ticks;
}

function linearTicks(max: number, count = 5): number[] {
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(value);
  return ticks;
}

interface Hover {
  series: PairedSeries;
  point: PairedPoint;
  px: number;
  py: number;
}

export function MeasuredVsModeledWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [view, setView] = useWidgetHash<MmView>(HASH_KEY, encodeMmView, decodeMmView);
  const measured = useView(mmViewUrl('measured'));
  const modeled = useView(mmViewUrl('modeled'));
  const { resolveColor } = useThemeColors({ highContrast: false, activeKeys: [...MM_GPUS] });
  const { setContainerRef, dimensions } = useResponsiveChartDimensions({ height: 1 });
  const width = Math.max(dimensions.width, 280);
  const height = width < 560 ? 300 : 380;
  const [hover, setHover] = useState<Hover | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [inViewRef, inView] = useInView({ threshold: 0.25 });
  const revealed = inViewAttr(inView);

  const paired = useMemo(
    () =>
      measured.status === 'ok' && modeled.status === 'ok'
        ? pairSeries(measured.data, modeled.data)
        : null,
    [measured, modeled],
  );

  const status =
    measured.status === 'failed' || modeled.status === 'failed'
      ? 'failed'
      : paired === null
        ? 'loading'
        : paired.length === 0
          ? 'empty'
          : 'ok';

  const plot = useMemo(() => {
    if (!paired || paired.length === 0) return null;
    const points = paired.flatMap((series) => series.points);
    const ys = points.flatMap((point) => [point.measured, point.modeled ?? point.measured]);
    const xMax = Math.max(...points.map((point) => point.x)) * 1.06;
    const yMin = Math.min(...ys) / 1.3;
    const yMax = Math.max(...ys) * 1.3;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    const xOf = (x: number) => MARGIN.left + (x / xMax) * innerW;
    const yOf = (y: number) =>
      MARGIN.top +
      innerH -
      ((Math.log10(y) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * innerH;
    return { xMax, yMin, yMax, innerW, innerH, xOf, yOf, points: points.length };
  }, [paired, width, height]);

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!plot || !paired || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    let best: Hover | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const series of paired) {
      for (const point of series.points) {
        const px = plot.xOf(point.x);
        const candidates = [point.measured, point.modeled].filter((y): y is number => y !== null);
        for (const y of candidates) {
          const py = plot.yOf(y);
          const distance = Math.hypot(px - mx, py - my);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = { series, point, px, py };
          }
        }
      }
    }
    setHover(bestDistance < 48 ? best : null);
  }

  const linePath = (series: PairedSeries, key: 'measured' | 'modeled') =>
    frontierLine(series, key)
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${plot!.xOf(point.x).toFixed(1)},${plot!.yOf(point[key]!).toFixed(1)}`,
      )
      .join(' ');

  return (
    <WidgetFrame name="measured-vs-modeled" alt={alt}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Chips<MmView>
          label={t.view}
          value={view}
          onChange={(next) => {
            setView(next);
            track('powerx_tutorial_chart_view', { value: next });
          }}
          options={MM_VIEWS.map((key) => ({
            value: key,
            label: t.views[key],
            title: t.viewTitles[key],
          }))}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 pr-1 text-xs text-muted-foreground">
          {paired?.map((series) => (
            <span key={series.hwKey} className="flex items-center gap-1.5">
              <GrammarSwatch kind="measured" color={resolveColor(series.gpu)} />
              {series.label}
            </span>
          ))}
          <GrammarLegend locale={locale} kinds={['measured', 'modeled']} />
        </div>
      </div>

      <div
        ref={setContainerRef}
        className="relative mt-4 min-w-0"
        onMouseLeave={() => setHover(null)}
      >
        {status === 'ok' && plot && paired ? (
          <div ref={inViewRef}>
            <svg
              ref={svgRef}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={t.aria(plot.points)}
              className="block select-none"
              fontSize={CHART_TYPE.axisLabel}
              onMouseMove={onMove}
            >
              {logTicks(plot.yMin, plot.yMax).map((tick) => (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    x2={width - MARGIN.right}
                    y1={plot.yOf(tick)}
                    y2={plot.yOf(tick)}
                    stroke="var(--border)"
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <text
                    x={MARGIN.left - 8}
                    y={plot.yOf(tick) + 4}
                    textAnchor="end"
                    fill="var(--muted-foreground)"
                  >
                    {tick}
                  </text>
                </g>
              ))}
              {linearTicks(plot.xMax).map((tick) => (
                <text
                  key={tick}
                  x={plot.xOf(tick)}
                  y={height - MARGIN.bottom + 18}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                >
                  {tick}
                </text>
              ))}
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={height - MARGIN.bottom}
                y2={height - MARGIN.bottom}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={width - MARGIN.right}
                y={height - 6}
                textAnchor="end"
                fill="var(--muted-foreground)"
              >
                {t.x}
              </text>
              <text x={MARGIN.left} y={MARGIN.top - 4} fill="var(--muted-foreground)">
                {t.y}
              </text>

              {paired.map((series) => {
                const color = resolveColor(series.gpu);
                return (
                  <g key={series.hwKey}>
                    <g opacity={view === 'modeled' ? 1 : 0.35} className={TOGGLE_FADE}>
                      <path
                        d={linePath(series, 'modeled')}
                        pathLength={1}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        data-draw=""
                        data-inview={revealed}
                        style={motionVars({ drawMs: DRAW_MS })}
                      />
                      <g
                        data-fade=""
                        data-inview={revealed}
                        style={motionVars({ delayMs: POINTS_DELAY_MS })}
                      >
                        {series.points
                          .filter((point) => point.modeled !== null)
                          .map((point) => (
                            <circle
                              key={`m-${point.id}`}
                              cx={plot.xOf(point.x)}
                              cy={plot.yOf(point.modeled!)}
                              r={4}
                              fill="var(--background)"
                              stroke={color}
                              strokeWidth={1.5}
                            />
                          ))}
                      </g>
                    </g>
                    <g opacity={view === 'measured' ? 1 : 0.35} className={TOGGLE_FADE}>
                      <path
                        d={linePath(series, 'measured')}
                        pathLength={1}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        data-draw=""
                        data-inview={revealed}
                        style={motionVars({ drawMs: DRAW_MS })}
                      />
                      <g
                        data-fade=""
                        data-inview={revealed}
                        style={motionVars({ delayMs: POINTS_DELAY_MS })}
                      >
                        {series.points.map((point) => (
                          <circle
                            key={`s-${point.id}`}
                            cx={plot.xOf(point.x)}
                            cy={plot.yOf(point.measured)}
                            r={4.5}
                            fill={color}
                            stroke="var(--background)"
                            strokeWidth={2}
                          />
                        ))}
                      </g>
                    </g>
                  </g>
                );
              })}
              {hover && (
                <line
                  x1={hover.px}
                  x2={hover.px}
                  y1={MARGIN.top}
                  y2={height - MARGIN.bottom}
                  stroke="var(--foreground)"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  pointerEvents="none"
                />
              )}
            </svg>
            {hover && (
              <div
                role="status"
                className={cn(
                  'pointer-events-none absolute z-10 w-56 rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-md',
                )}
                style={{
                  left: Math.min(hover.px + 12, width - 232),
                  top: Math.max(0, Math.min(hover.py - 20, height - 110)),
                }}
              >
                <p className="font-semibold text-foreground">{hover.series.label}</p>
                <p className="text-muted-foreground">
                  {t.tooltip.point(hover.point.x, hover.point.concurrency)}
                </p>
                <p className="mt-1 flex items-center justify-between gap-2 text-foreground">
                  <span className="flex items-center gap-1.5">
                    <GrammarSwatch kind="measured" color={resolveColor(hover.series.gpu)} />
                    {t.tooltip.measured}
                  </span>
                  <span className="font-mono tabular-nums">
                    {hover.point.measured.toFixed(2)} J/tok
                  </span>
                </p>
                {hover.point.modeled !== null && (
                  <p className="flex items-center justify-between gap-2 text-foreground">
                    <span className="flex items-center gap-1.5">
                      <GrammarSwatch kind="modeled" color={resolveColor(hover.series.gpu)} />
                      {t.tooltip.modeled}
                    </span>
                    <span className="font-mono tabular-nums">
                      {hover.point.modeled.toFixed(2)} J/tok{' '}
                      <span className="text-muted-foreground">
                        {t.tooltip.ratio(hover.point.modeled / hover.point.measured)}
                      </span>
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p role="status" className="flex min-h-40 items-center text-sm text-muted-foreground">
            {status === 'loading' ? t.loading : status === 'failed' ? t.failed : t.empty}
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">{t.preset}</span>
        <span className="flex items-center gap-1">
          <a
            href={mmDashboardUrl(view)}
            onClick={() => track('powerx_tutorial_chart_opened', { value: view })}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-brand hover:underline md:min-h-8"
          >
            {t.open}
          </a>
          <CopyButton
            text={`${typeof window === 'undefined' ? '' : window.location.origin}${mmViewUrl(view)}`}
            label={t.copy}
            locale={locale}
            event="powerx_tutorial_chart_url_copied"
          />
        </span>
      </div>
    </WidgetFrame>
  );
}
