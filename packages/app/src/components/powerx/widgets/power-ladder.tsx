'use client';

import { useMemo } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { Locale } from '@/lib/i18n/i18n';
import { type Ladder, type StaggerLabel, staggerLabels } from '@/lib/powerx/ladder';
import { cn } from '@/lib/shared/utils';

import { type TweenPlan, type TweenValues, useReducedMotion, useTweens } from './motion';
import { GROUP_LABELS, GROUP_TITLES } from './strings';
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

/**
 * The build: the measured bar grows first, the modeled parts fill in left to right, the PUE
 * extension draws, then the rated ticks fade in. A chip switch interpolates everything at once.
 */
export const LADDER_MOTION = {
  gpuMs: 700,
  stepMs: 60,
  partMs: 320,
  extensionMs: 400,
  ticksMs: 300,
  switchMs: 350,
} as const;

const SNAP = { delayMs: 0, durationMs: 0 };

/** Every number the drawing tweens, keyed so the plan can sequence them. */
export function ladderTargets(ladder: Ladder): TweenValues {
  const targets: TweenValues = {
    scaleMax: Math.max(ladder.facilityWatts, ladder.allInWatts) * 1.03,
    facility: ladder.facilityWatts,
    tdp: ladder.tdpWatts,
    allIn: ladder.allInWatts,
    extension: 1,
    ticks: 1,
    gpuLabel: 1,
  };
  for (const segment of ladder.segments) targets[`seg:${segment.group}`] = segment.watts;
  return targets;
}

export function ladderPlan(ladder: Ladder): TweenPlan {
  const modeled = ladder.segments
    .filter((segment) => segment.kind === 'modeled')
    .map((segment) => segment.group);
  const { gpuMs, stepMs, partMs, extensionMs, ticksMs, switchMs } = LADDER_MOTION;
  const extensionStart = gpuMs + Math.max(0, modeled.length - 1) * stepMs + partMs;
  const ticksStart = extensionStart + extensionMs - 100;
  return (key, phase) => {
    if (phase === 'update') {
      return key === 'extension' || key === 'ticks' || key === 'gpuLabel'
        ? SNAP
        : { delayMs: 0, durationMs: switchMs };
    }
    if (key.startsWith('seg:')) {
      const group = key.slice(4);
      const index = modeled.indexOf(group as (typeof modeled)[number]);
      return index === -1
        ? { delayMs: 0, durationMs: gpuMs, from: 0 }
        : { delayMs: gpuMs + index * stepMs, durationMs: partMs, from: 0 };
    }
    if (key === 'extension') return { delayMs: extensionStart, durationMs: extensionMs, from: 0 };
    if (key === 'ticks') return { delayMs: ticksStart, durationMs: ticksMs, from: 0 };
    if (key === 'gpuLabel') return { delayMs: gpuMs * 0.45, durationMs: 300, from: 0 };
    return SNAP;
  };
}

interface LadderLabel extends StaggerLabel {
  text: string;
  title: string;
}

/** Label text and anchor positions for one set of numbers; the layout is derived from the target. */
function ladderLabels(
  t: (typeof STRINGS)[Locale],
  titles: Record<string, string>,
  width: number,
  numbers: {
    gpu: number;
    it: number;
    facility: number;
    tdp: number;
    allIn: number;
    pue: number;
    scaleMax: number;
  },
  gpuInline: boolean,
) {
  const px = (width - 2 * PAD) / numbers.scaleMax;
  const xOf = (watts: number) => PAD + watts * px;
  const gpuText = t.gpu(formatWatts(numbers.gpu));
  const top: LadderLabel[] = [
    {
      key: 'it',
      x: xOf(numbers.it) - 3,
      anchor: 'end',
      text: t.it(formatWatts(numbers.it)),
      title: t.itTitle,
      width: 0,
    },
  ];
  if (!gpuInline) {
    top.push({ key: 'gpu', x: PAD, anchor: 'start', text: gpuText, title: titles.gpu, width: 0 });
  }
  const bottom: LadderLabel[] = [
    {
      key: 'tdp',
      x: xOf(numbers.tdp),
      anchor: 'middle',
      text: t.tdp(formatWatts(numbers.tdp)),
      title: t.tdpTitle,
      width: 0,
    },
    {
      key: 'allIn',
      x: xOf(numbers.allIn),
      anchor: 'middle',
      text: t.allIn(formatWatts(numbers.allIn)),
      title: t.allInTitle,
      width: 0,
    },
    {
      key: 'facility',
      x: xOf(numbers.facility),
      anchor: 'end',
      text: t.facility(numbers.pue, formatWatts(numbers.facility)),
      title: t.facilityTitle,
      width: 0,
    },
  ];
  for (const label of [...top, ...bottom]) {
    label.width = label.text.length * CHAR;
    // Keep middle-anchored labels inside the frame.
    if (label.anchor === 'middle') {
      label.x = Math.min(Math.max(label.x, label.width / 2 + PAD), width - label.width / 2 - PAD);
    }
  }
  return { top, bottom, gpuText, px, xOf };
}

export interface PowerLadderProps {
  ladder: Ladder;
  color: string;
  locale: Locale;
  /** Without the parts list and with a shorter bar, for the worked example. */
  compact?: boolean;
  /** The build plays when this first turns true; false holds the empty frame. */
  active?: boolean;
  className?: string;
}

export function PowerLadder({
  ladder,
  color,
  locale,
  compact = false,
  active = true,
  className,
}: PowerLadderProps) {
  const t = STRINGS[locale];
  const groups = GROUP_LABELS[locale];
  const titles = GROUP_TITLES[locale];
  const { setContainerRef, dimensions } = useResponsiveChartDimensions({ height: 1 });
  const width = Math.max(dimensions.width, 240);
  const reduced = useReducedMotion();
  const targets = useMemo(() => ladderTargets(ladder), [ladder]);
  const plan = useMemo(() => ladderPlan(ladder), [ladder]);
  const shown = useTweens(targets, { active, reduced, plan });

  const barH = compact ? 26 : 34;
  const segmentWatts = (group: string) => shown[`seg:${group}`] ?? 0;
  const gpuShown = segmentWatts('gpu');
  const itShown = ladder.segments.reduce((sum, segment) => sum + segmentWatts(segment.group), 0);
  const facilityShown = shown.facility;
  const extensionEnd = itShown + shown.extension * (facilityShown - itShown);

  // Rows and heights come from the final numbers so labels never hop between rows mid-tween.
  const finalNumbers = {
    gpu: ladder.gpuWatts,
    it: ladder.itWatts,
    facility: ladder.facilityWatts,
    tdp: ladder.tdpWatts,
    allIn: ladder.allInWatts,
    pue: ladder.pue,
    scaleMax: targets.scaleMax,
  };
  const finalPx = (width - 2 * PAD) / targets.scaleMax;
  const gpuInline =
    ladder.gpuWatts * finalPx >= t.gpu(formatWatts(ladder.gpuWatts)).length * CHAR + 24;
  const layout = ladderLabels(t, titles, width, finalNumbers, gpuInline);
  const topRows = staggerLabels(layout.top);
  const bottomRows = staggerLabels(layout.bottom);
  const topRowCount = Math.max(0, ...topRows.values()) + 1;
  const bottomRowCount = Math.max(0, ...bottomRows.values()) + 1;
  const barY = topRowCount * ROW + 4;
  const tickY = barY + barH;
  const height = tickY + 10 + bottomRowCount * ROW + 2;

  const live = ladderLabels(
    t,
    titles,
    width,
    {
      gpu: gpuShown,
      it: itShown,
      facility: extensionEnd,
      tdp: shown.tdp,
      allIn: shown.allIn,
      pue: ladder.pue,
      scaleMax: shown.scaleMax,
    },
    gpuInline,
  );
  const { px, xOf } = live;
  const itX = xOf(itShown);
  const extensionX = xOf(extensionEnd);
  const labelOpacity: Record<string, number> = {
    it: 1,
    gpu: shown.gpuLabel,
    tdp: shown.ticks,
    allIn: shown.ticks,
    facility: shown.extension,
  };

  let cursor = 0;
  const segments = ladder.segments.map((segment) => {
    const watts = segmentWatts(segment.group);
    const x0 = xOf(cursor);
    cursor += watts;
    const w = Math.max(0, watts * px - GAP);
    return { ...segment, watts, x0, w, share: (segment.watts / ladder.itWatts) * 100 };
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
        {live.top.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={(topRows.get(label.key) ?? 0) * ROW + 11}
            textAnchor={label.anchor}
            fill="var(--foreground)"
            fontWeight={label.key === 'it' ? 600 : 500}
            opacity={labelOpacity[label.key]}
            className="tabular-nums"
          >
            <title>{label.title}</title>
            {label.text}
          </text>
        ))}

        {/* PUE extension: the assumed multiplier from IT to facility. */}
        <rect
          x={itX + GAP}
          y={barY}
          width={Math.max(0, extensionX - itX - GAP)}
          height={barH}
          fill="none"
          stroke={RATED}
          strokeWidth={1}
          strokeDasharray="4 3"
        >
          <title>{t.facilityTitle}</title>
        </rect>

        {segments.map((segment) => (
          <g key={segment.group} data-segment={segment.group}>
            <title>{`${groups[segment.group]} · ${formatWatts(segment.watts)} W · ${t.share(segment.share)} — ${titles[segment.group]}`}</title>
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
            opacity={shown.gpuLabel}
            className="tabular-nums"
          >
            {live.gpuText}
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
          const x = xOf(key === 'tdp' ? shown.tdp : shown.allIn);
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
              opacity={shown.ticks}
            />
          );
        })}
        <line
          x1={extensionX}
          x2={extensionX}
          y1={tickY}
          y2={tickY + 8}
          stroke={RATED}
          strokeWidth={1}
          opacity={shown.extension}
        />

        {live.bottom.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={tickY + 10 + (bottomRows.get(label.key) ?? 0) * ROW + 9}
            textAnchor={label.anchor}
            opacity={labelOpacity[label.key]}
            className="tabular-nums"
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
              key={segment.group}
              title={`${t.share(segment.share)} — ${titles[segment.group]}`}
              className="flex items-center gap-1.5"
            >
              <GrammarSwatch kind={segment.kind} color={color} />
              <span className={segment.kind === 'measured' ? 'text-foreground' : undefined}>
                {groups[segment.group]}
              </span>
              <span className="font-mono tabular-nums">{formatWatts(segment.watts)} W</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
