'use client';

import { type KeyboardEvent, useState } from 'react';

import { Chips, WidgetFrame, type WidgetProps } from '@/components/tutorial/widget-chrome';
import { track } from '@/lib/analytics/analytics';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { cn } from '@/lib/shared/utils';

type Metric = 'psnr' | 'ssim' | 'lpips';
type MarkId = 'anchor' | 'cache' | 'cache-sparse';

const METRICS = ['psnr', 'ssim', 'lpips'] as const;

const STRINGS = {
  en: {
    metric: 'Quality score',
    metricTitles: {
      psnr: 'Peak signal-to-noise ratio in dB. Higher is closer.',
      ssim: 'Structural similarity, at most 1. Higher is closer.',
      lpips: 'Perceptual distance from neural-network features, 0 when identical. Lower is closer.',
    },
    illustrative: 'Illustrative, not measured',
    y: 'Speedup over the lossless twin',
    x: {
      psnr: 'PSNR against the same engine’s lossless output (dB) · right is closer',
      ssim: 'SSIM against the same engine’s lossless output · right is closer',
      lpips: 'LPIPS against the same engine’s lossless output · axis reversed, right is closer',
    },
    identical: 'identical',
    corner: '↗ faster and closer to lossless',
    marks: {
      anchor: 'Lossless twin',
      cache: 'Cross-step cache',
      'cache-sparse': 'Cache + sparse attention',
    },
    speedup: 'Speedup',
    spread: 'Median / worst clip',
    legendAnchor: 'Lossless twin: 1.0× and identical by definition',
    legendLossy: 'Lossy config: the median clip, with a whisker to the worst clip',
  },
  zh: {
    metric: '质量分数',
    metricTitles: {
      psnr: '峰值信噪比，单位 dB，越高越接近。',
      ssim: '结构相似度，最大为 1，越高越接近。',
      lpips: '基于神经网络特征的感知距离，完全一致时为 0，越低越接近。',
    },
    illustrative: '示意数据，非实测',
    y: '相对无损对照的加速倍数',
    x: {
      psnr: '与同一引擎无损输出比较的 PSNR（dB）· 越靠右越接近',
      ssim: '与同一引擎无损输出比较的 SSIM · 越靠右越接近',
      lpips: '与同一引擎无损输出比较的 LPIPS · 坐标反向，越靠右越接近',
    },
    identical: '完全一致',
    corner: '↗ 更快，也更接近无损',
    marks: {
      anchor: '无损对照',
      cache: '跨步 cache',
      'cache-sparse': 'cache + 稀疏注意力',
    },
    speedup: '加速倍数',
    spread: '中位数 / 最差视频',
    legendAnchor: '无损对照：1.0×，按定义完全一致',
    legendLossy: '有损配置：点为中位数视频，横线延伸到最差的一条',
  },
} as const;

/**
 * Placeholder configs that show how the chart will read once paired runs exist. These are not
 * measurements: the speedups apply one vendor-reported ratio and the quality scores are invented.
 */
const EXAMPLES: readonly {
  id: Exclude<MarkId, 'anchor'>;
  speedup: number;
  quality: Record<Metric, readonly [median: number, worst: number]>;
}[] = [
  {
    id: 'cache',
    speedup: 2.27,
    quality: { psnr: [31.4, 24.8], ssim: [0.93, 0.85], lpips: [0.07, 0.15] },
  },
  {
    id: 'cache-sparse',
    speedup: 2.83,
    quality: { psnr: [27.2, 21.6], ssim: [0.88, 0.79], lpips: [0.12, 0.21] },
  },
];

/** Unused x at the left, and where "identical" sits for every metric, in percent. */
const PAD = 3;
const IDENTICAL_X = 96;
/** PSNR has no finite identical value, so its scale stops short and breaks before ∞. */
const PSNR_BREAK_X = 86;

const AXES: Record<
  Metric,
  { ticks: readonly number[]; digits: number; unit: string; x: (value: number) => number }
> = {
  psnr: {
    ticks: [20, 25, 30, 35, 40],
    digits: 1,
    unit: ' dB',
    x: (value) => PAD + ((value - 20) / 20) * (PSNR_BREAK_X - PAD),
  },
  ssim: {
    ticks: [0.75, 0.8, 0.85, 0.9, 0.95, 1],
    digits: 2,
    unit: '',
    x: (value) => PAD + ((value - 0.75) / 0.25) * (IDENTICAL_X - PAD),
  },
  lpips: {
    ticks: [0.25, 0.2, 0.15, 0.1, 0.05, 0],
    digits: 2,
    unit: '',
    x: (value) => PAD + ((0.25 - value) / 0.25) * (IDENTICAL_X - PAD),
  },
};

const HEIGHT = 280;
const TOP = 28;
const BOTTOM = 10;
const Y_TICKS = [1, 1.5, 2, 2.5, 3] as const;
const y = (speedup: number) => TOP + (1 - (speedup - 0.8) / 2.4) * (HEIGHT - TOP - BOTTOM);
const pct = (value: number) => `${value}%`;

interface Mark {
  id: MarkId;
  speedup: number;
  x: number;
  worstX: number | null;
}

const isSelectKey = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

/**
 * The sweet-spot chart on illustrative data: speedup over the lossless twin against how close a
 * lossy config's clips stay to it, on one switchable quality score.
 */
export function TradeoffWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [metric, setMetric] = useState<Metric>('psnr');
  const [picked, setPicked] = useState<MarkId>('cache-sparse');
  const axis = AXES[metric];
  const marks: Mark[] = [
    { id: 'anchor', speedup: 1, x: IDENTICAL_X, worstX: null },
    ...EXAMPLES.map((example) => ({
      id: example.id,
      speedup: example.speedup,
      x: axis.x(example.quality[metric][0]),
      worstX: axis.x(example.quality[metric][1]),
    })),
  ];
  // One engine's configs join into a line, from the lossless twin leftward.
  const line = marks.toSorted((a, b) => b.x - a.x);
  const pick = (id: MarkId) => {
    setPicked(id);
    track('video_quality_guide_tradeoff_point', { value: id });
  };

  return (
    <WidgetFrame scope="video" name="tradeoff" alt={alt}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Chips<Metric>
          label={t.metric}
          value={metric}
          onChange={(next) => {
            setMetric(next);
            track('video_quality_guide_tradeoff_metric', { value: next });
          }}
          options={METRICS.map((key) => ({
            value: key,
            label: key.toUpperCase(),
            title: t.metricTitles[key],
          }))}
        />
        <span
          data-testid="video-quality-guide-illustrative"
          className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          {t.illustrative}
        </span>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">{t.y} ↑</p>
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)]">
            <div className="relative" style={{ height: HEIGHT }}>
              {Y_TICKS.map((tick) => (
                <span
                  key={tick}
                  style={{ top: y(tick), fontSize: CHART_TYPE.axisLabel }}
                  className="absolute right-2 -translate-y-1/2 text-muted-foreground tabular-nums"
                >
                  {tick.toFixed(1)}×
                </span>
              ))}
            </div>
            <svg
              width="100%"
              height={HEIGHT}
              className="block overflow-visible select-none"
              data-testid="video-quality-guide-tradeoff-plot"
            >
              {Y_TICKS.map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  x2="100%"
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeOpacity={0.5}
                />
              ))}
              {axis.ticks.map((tick) => (
                <line
                  key={tick}
                  x1={pct(axis.x(tick))}
                  x2={pct(axis.x(tick))}
                  y1={TOP}
                  y2={HEIGHT}
                  stroke="var(--border)"
                  strokeOpacity={0.5}
                />
              ))}
              <line x1="0" x2="0" y1={0} y2={HEIGHT} stroke="var(--border)" />
              <line x1="0" x2="100%" y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--border)" />
              <text
                x="99%"
                y={14}
                textAnchor="end"
                fontSize={CHART_TYPE.annotation}
                fontWeight={600}
                fill="var(--muted-foreground)"
              >
                {t.corner}
              </text>
              {line.slice(1).map((mark, index) => (
                <line
                  key={mark.id}
                  x1={pct(line[index].x)}
                  x2={pct(mark.x)}
                  y1={y(line[index].speedup)}
                  y2={y(mark.speedup)}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
              ))}
              {marks.map((mark) => {
                const cy = y(mark.speedup);
                const anchor = mark.id === 'anchor';
                return (
                  <g
                    key={mark.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={picked === mark.id}
                    aria-label={`${t.marks[mark.id]}, ${mark.speedup.toFixed(2)}×`}
                    data-testid="video-quality-guide-tradeoff-mark"
                    className="cursor-pointer outline-none"
                    onPointerEnter={() => setPicked(mark.id)}
                    onFocus={() => setPicked(mark.id)}
                    onClick={() => pick(mark.id)}
                    onKeyDown={(event) => {
                      if (!isSelectKey(event)) return;
                      event.preventDefault();
                      pick(mark.id);
                    }}
                  >
                    <circle cx={pct(mark.x)} cy={cy} r={16} fill="transparent" />
                    {picked === mark.id && (
                      <circle
                        cx={pct(mark.x)}
                        cy={cy}
                        r={14}
                        fill="none"
                        stroke="var(--foreground)"
                        strokeWidth={1.2}
                        strokeDasharray="3 3"
                      />
                    )}
                    {mark.worstX !== null && (
                      <>
                        <line
                          x1={pct(mark.worstX)}
                          x2={pct(mark.x)}
                          y1={cy}
                          y2={cy}
                          stroke="var(--muted-foreground)"
                          strokeWidth={2}
                        />
                        <line
                          x1={pct(mark.worstX)}
                          x2={pct(mark.worstX)}
                          y1={cy - 5}
                          y2={cy + 5}
                          stroke="var(--muted-foreground)"
                          strokeWidth={2}
                        />
                      </>
                    )}
                    {/* A nested viewport places a shape at a percentage x. */}
                    <svg x={pct(mark.x)} y={cy} overflow="visible">
                      {anchor ? (
                        <circle
                          r={6}
                          fill="var(--background)"
                          stroke="var(--foreground)"
                          strokeWidth={2}
                        />
                      ) : (
                        <path d="M0,-7 L7,5.5 L-7,5.5 Z" fill="var(--foreground)" />
                      )}
                    </svg>
                    <text
                      x={pct(mark.x)}
                      y={cy - 14}
                      textAnchor={anchor ? 'end' : 'middle'}
                      fontSize={CHART_TYPE.axisLabel}
                      fontWeight={600}
                      fill="var(--foreground)"
                      // A halo keeps the name legible where the engine's line crosses it.
                      stroke="var(--background)"
                      strokeWidth={4}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {t.marks[mark.id]}
                    </text>
                  </g>
                );
              })}
            </svg>
            <span />
            <svg aria-hidden="true" width="100%" height={36} className="block overflow-visible">
              {axis.ticks.map((tick) => (
                <text
                  key={tick}
                  x={pct(axis.x(tick))}
                  y={16}
                  textAnchor="middle"
                  fontSize={CHART_TYPE.axisLabel}
                  fill="var(--muted-foreground)"
                >
                  {tick === 0 ? '0' : tick.toFixed(axis.digits === 1 ? 0 : 2)}
                </text>
              ))}
              {metric === 'psnr' && (
                <>
                  <text
                    x={pct(IDENTICAL_X)}
                    y={16}
                    textAnchor="middle"
                    fontSize={CHART_TYPE.axisLabel}
                    fill="var(--muted-foreground)"
                  >
                    ∞
                  </text>
                  <svg x={pct((PSNR_BREAK_X + IDENTICAL_X) / 2)} y={0} overflow="visible">
                    <path
                      d="M-5,4 L-1,-4 M1,4 L5,-4"
                      fill="none"
                      stroke="var(--muted-foreground)"
                      strokeWidth={1.2}
                    />
                  </svg>
                </>
              )}
              <text
                x="100%"
                y={31}
                textAnchor="end"
                fontSize={CHART_TYPE.annotationSub}
                fill="var(--muted-foreground)"
              >
                {t.identical}
              </text>
            </svg>
            <span />
            {/* Every title shares one cell, so the box keeps the tallest one's height. */}
            <p
              data-testid="video-quality-guide-tradeoff-x-title"
              className="grid text-center text-xs text-muted-foreground"
            >
              {METRICS.map((key) => (
                <span
                  key={key}
                  aria-hidden={key !== metric}
                  className={cn('col-start-1 row-start-1', key !== metric && 'invisible')}
                >
                  {t.x[key]}
                </span>
              ))}
            </p>
          </div>
        </div>
        <Readout locale={locale} metric={metric} picked={picked} />
      </div>
    </WidgetFrame>
  );
}

function Readout({
  locale,
  metric,
  picked,
}: {
  locale: WidgetProps['locale'];
  metric: Metric;
  picked: MarkId;
}) {
  const t = STRINGS[locale];
  const example = EXAMPLES.find((item) => item.id === picked);
  const ids: MarkId[] = ['anchor', ...EXAMPLES.map((item) => item.id)];
  return (
    <aside className="flex min-w-0 flex-col gap-4 text-xs">
      <div
        role="status"
        data-testid="video-quality-guide-tradeoff-readout"
        className="rounded-lg border border-border/60 p-3"
      >
        {/* Every name shares one cell, so the box keeps the longest one's height. */}
        <p className="grid text-sm font-semibold">
          {ids.map((id) => (
            <span
              key={id}
              aria-hidden={id !== picked}
              className={cn('col-start-1 row-start-1', id !== picked && 'invisible')}
            >
              {t.marks[id]}
            </span>
          ))}
        </p>
        {/* Values start at a fixed column, so a changing value never moves its box. */}
        <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2">
          <dt className="text-muted-foreground">{t.speedup}</dt>
          <dd className="m-0 font-mono tabular-nums">{(example?.speedup ?? 1).toFixed(2)}×</dd>
        </dl>
        <p className="mt-2 text-muted-foreground">{t.spread}</p>
        <dl className="mt-1 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
          {METRICS.map((key) => {
            const axis = AXES[key];
            const value = example
              ? `${example.quality[key].map((score) => score.toFixed(axis.digits)).join(' / ')}${axis.unit}`
              : t.identical;
            return (
              <div
                key={key}
                className={cn(
                  'col-span-2 grid grid-cols-subgrid font-mono tabular-nums',
                  key === metric ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <dt>{key.toUpperCase()}</dt>
                <dd className="m-0">{value}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      <ul className="flex flex-col gap-2 text-muted-foreground">
        <li className="flex items-start gap-2">
          <svg aria-hidden="true" width="22" height="14" className="mt-0.5 shrink-0">
            <circle
              cx={11}
              cy={7}
              r={5}
              fill="var(--background)"
              stroke="var(--foreground)"
              strokeWidth={2}
            />
          </svg>
          {t.legendAnchor}
        </li>
        <li className="flex items-start gap-2">
          <svg aria-hidden="true" width="22" height="14" className="mt-0.5 shrink-0">
            <line x1={2} x2={14} y1={7} y2={7} stroke="var(--muted-foreground)" strokeWidth={2} />
            <line x1={2} x2={2} y1={3} y2={11} stroke="var(--muted-foreground)" strokeWidth={2} />
            <path d="M15,1 L21,12 L9,12 Z" fill="var(--foreground)" />
          </svg>
          {t.legendLossy}
        </li>
      </ul>
    </aside>
  );
}
