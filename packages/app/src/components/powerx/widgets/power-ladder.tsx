'use client';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { Locale } from '@/lib/i18n/i18n';
import { type Ladder, type StaggerLabel, staggerLabels } from '@/lib/powerx/ladder';
import { cn } from '@/lib/shared/utils';
import { SYSTEM_POWER_CATEGORY_LABELS } from '@/lib/power/system-power-model';

import { CATEGORY_TITLES } from './strings';
import { formatWatts, GrammarSwatch } from './widget-chrome';

const STRINGS = {
  en: {
    it: (watts: string) => `IT ${watts} W`,
    itTitle: 'Measured GPU plus every modeled part, before PUE',
    facility: (pue: number, watts: string) => `Facility ×${pue} ${watts} W`,
    facilityTitle: 'IT × PUE for this cooling mode; the dashed extension is the PUE assumption',
    tdp: (watts: string) => `TDP ${watts} W`,
    tdpTitle: 'Vendor thermal design power of the GPU',
    allIn: (watts: string) => `All-in provisioned ${watts} W`,
    allInTitle: 'Vendor all-in provisioned watts per GPU that operators size racks with',
    gpu: (watts: string) => `GPU ${watts} W`,
    share: (pct: number) => `${pct.toFixed(1)} % of IT`,
    summary: (gpu: string, it: string, facility: string) =>
      `Power ladder: measured GPU ${gpu} W, modeled IT ${it} W, facility ${facility} W per GPU`,
  },
  zh: {
    it: (watts: string) => `IT ${watts} W`,
    itTitle: '实测 GPU 加上所有建模部件，不含 PUE',
    facility: (pue: number, watts: string) => `数据中心 ×${pue} ${watts} W`,
    facilityTitle: 'IT × 该散热方式的 PUE；虚线延伸段就是 PUE 这一假设',
    tdp: (watts: string) => `TDP ${watts} W`,
    tdpTitle: '厂商标称的 GPU 热设计功耗',
    allIn: (watts: string) => `全系统 provisioned ${watts} W`,
    allInTitle: '厂商给出的每 GPU 全系统 provisioned 功率，运营商按它规划机柜',
    gpu: (watts: string) => `GPU ${watts} W`,
    share: (pct: number) => `占 IT ${pct.toFixed(1)} %`,
    summary: (gpu: string, it: string, facility: string) =>
      `功耗阶梯：每 GPU 实测 ${gpu} W，建模 IT ${it} W，数据中心 ${facility} W`,
  },
} as const;

const PAD = 4;
const GAP = 2;
const ROW = 15;
const CHAR = 6.6;
const RATED = 'var(--muted-foreground)';

export interface PowerLadderProps {
  ladder: Ladder;
  color: string;
  locale: Locale;
  /** Without the parts list and with a shorter bar, for the worked example. */
  compact?: boolean;
  className?: string;
}

export function PowerLadder({
  ladder,
  color,
  locale,
  compact = false,
  className,
}: PowerLadderProps) {
  const t = STRINGS[locale];
  const names = SYSTEM_POWER_CATEGORY_LABELS[locale];
  const titles = CATEGORY_TITLES[locale];
  const { setContainerRef, dimensions } = useResponsiveChartDimensions({ height: 1 });
  const width = Math.max(dimensions.width, 240);
  const maxWatts = Math.max(ladder.facilityWatts, ladder.allInWatts) * 1.03;
  const px = (width - 2 * PAD) / maxWatts;
  const xOf = (watts: number) => PAD + watts * px;

  const barH = compact ? 26 : 34;
  const itX = xOf(ladder.itWatts);
  const facilityX = xOf(ladder.facilityWatts);
  const gpuWidth = ladder.gpuWatts * px;
  const gpuText = t.gpu(formatWatts(ladder.gpuWatts));
  const gpuInline = gpuWidth >= gpuText.length * CHAR + 24;

  const topLabels: (StaggerLabel & { text: string; title: string })[] = [
    {
      key: 'it',
      x: itX - 3,
      anchor: 'end',
      text: t.it(formatWatts(ladder.itWatts)),
      title: t.itTitle,
      width: 0,
    },
  ];
  if (!gpuInline) {
    topLabels.push({
      key: 'gpu',
      x: PAD,
      anchor: 'start',
      text: gpuText,
      title: titles.gpu,
      width: 0,
    });
  }
  const bottomLabels: (StaggerLabel & { text: string; title: string })[] = [
    {
      key: 'tdp',
      x: xOf(ladder.tdpWatts),
      anchor: 'middle',
      text: t.tdp(formatWatts(ladder.tdpWatts)),
      title: t.tdpTitle,
      width: 0,
    },
    {
      key: 'allIn',
      x: xOf(ladder.allInWatts),
      anchor: 'middle',
      text: t.allIn(formatWatts(ladder.allInWatts)),
      title: t.allInTitle,
      width: 0,
    },
    {
      key: 'facility',
      x: facilityX,
      anchor: 'end',
      text: t.facility(ladder.pue, formatWatts(ladder.facilityWatts)),
      title: t.facilityTitle,
      width: 0,
    },
  ];
  for (const label of [...topLabels, ...bottomLabels]) {
    label.width = label.text.length * CHAR;
    // Keep middle-anchored labels inside the frame.
    if (label.anchor === 'middle') {
      label.x = Math.min(Math.max(label.x, label.width / 2 + PAD), width - label.width / 2 - PAD);
    }
  }
  const topRows = staggerLabels(topLabels);
  const bottomRows = staggerLabels(bottomLabels);
  const topRowCount = Math.max(0, ...topRows.values()) + 1;
  const bottomRowCount = Math.max(0, ...bottomRows.values()) + 1;
  const barY = topRowCount * ROW + 4;
  const tickY = barY + barH;
  const height = tickY + 10 + bottomRowCount * ROW + 2;

  let cursor = 0;
  const segments = ladder.segments.map((segment) => {
    const x0 = xOf(cursor);
    cursor += segment.watts;
    const w = Math.max(0, segment.watts * px - GAP);
    return { ...segment, x0, w, share: (segment.watts / ladder.itWatts) * 100 };
  });

  return (
    <div ref={setContainerRef} className={cn('min-w-0', className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t.summary(
          formatWatts(ladder.gpuWatts),
          formatWatts(ladder.itWatts),
          formatWatts(ladder.facilityWatts),
        )}
        className="block overflow-visible select-none"
        fontSize={CHART_TYPE.axisLabel}
        fill="var(--muted-foreground)"
      >
        {topLabels.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={(topRows.get(label.key) ?? 0) * ROW + 11}
            textAnchor={label.anchor}
            fill="var(--foreground)"
            fontWeight={label.key === 'it' ? 600 : 500}
          >
            <title>{label.title}</title>
            {label.text}
          </text>
        ))}

        {/* PUE extension: the assumed multiplier from IT to facility. */}
        <rect
          x={itX + GAP}
          y={barY}
          width={Math.max(0, facilityX - itX - GAP)}
          height={barH}
          fill="none"
          stroke={RATED}
          strokeWidth={1}
          strokeDasharray="4 3"
        >
          <title>{t.facilityTitle}</title>
        </rect>

        {segments.map((segment) => (
          <g key={segment.category} data-segment={segment.category}>
            <title>{`${names[segment.category]} · ${formatWatts(segment.watts)} W · ${t.share(segment.share)} — ${titles[segment.category]}`}</title>
            {segment.kind === 'measured' ? (
              <rect x={segment.x0} y={barY} width={segment.w} height={barH} fill={color} />
            ) : (
              <rect
                x={segment.x0 + 0.625}
                y={barY + 0.625}
                width={Math.max(0, segment.w - 1.25)}
                height={barH - 1.25}
                fill={color}
                fillOpacity={0.14}
                stroke={color}
                strokeWidth={1.25}
              />
            )}
          </g>
        ))}
        {gpuInline && (
          <text
            x={PAD + 8}
            y={barY + barH / 2 + 4}
            fill="var(--primary-foreground)"
            fontWeight={600}
            pointerEvents="none"
          >
            {gpuText}
          </text>
        )}

        {/* IT boundary and the rated ticks. */}
        <line
          x1={itX}
          x2={itX}
          y1={barY - 3}
          y2={tickY}
          stroke="var(--foreground)"
          strokeWidth={1.5}
        />
        {(['tdp', 'allIn'] as const).map((key) => {
          const x = xOf(key === 'tdp' ? ladder.tdpWatts : ladder.allInWatts);
          return (
            <line
              key={key}
              x1={x}
              x2={x}
              y1={barY - 2}
              y2={tickY + 8}
              stroke={RATED}
              strokeWidth={1.25}
              strokeDasharray="3 2"
            />
          );
        })}
        <line
          x1={facilityX}
          x2={facilityX}
          y1={tickY}
          y2={tickY + 8}
          stroke={RATED}
          strokeWidth={1}
        />

        {bottomLabels.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={tickY + 10 + (bottomRows.get(label.key) ?? 0) * ROW + 9}
            textAnchor={label.anchor}
          >
            <title>{label.title}</title>
            {label.text}
          </text>
        ))}
      </svg>

      {!compact && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <li
              key={segment.category}
              title={`${t.share(segment.share)} — ${titles[segment.category]}`}
              className="flex items-center gap-1.5"
            >
              <GrammarSwatch kind={segment.kind} color={color} />
              <span className={segment.kind === 'measured' ? 'text-foreground' : undefined}>
                {names[segment.category]}
              </span>
              <span className="font-mono tabular-nums">{formatWatts(segment.watts)} W</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
