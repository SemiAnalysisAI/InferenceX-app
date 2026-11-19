'use client';

import { type CSSProperties, useMemo } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { Locale } from '@/lib/i18n/i18n';
import {
  buildLadder,
  type Ladder,
  type LadderHardware,
  type StaggerLabel,
  staggerLabels,
} from '@/lib/powerx/ladder';
import { cn } from '@/lib/shared/utils';
import { SYSTEM_POWER_CATEGORY_LABELS } from '@/lib/power/system-power-model';

import { stepProgress, useBuildClock, useEasedValues } from './motion';
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
    board: (watts: string) => `Bianca board ${watts} W`,
    boardTitle:
      'One Bianca board carries two GPUs, one Grace CPU and its LPDDR5X; this is one GPU’s half',
    share: (pct: number) => `${pct.toFixed(1)} % of IT`,
    summary: (gpu: string, it: string, facility: string) =>
      `Power ladder: measured GPU ${gpu} W, measured IT ${it} W, facility ${facility} W per GPU`,
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
    board: (watts: string) => `Bianca 板卡 ${watts} W`,
    boardTitle:
      '一块 Bianca 板卡搭载 2 颗 GPU、1 颗 Grace CPU 及其 LPDDR5X；这里是单颗 GPU 分摊的一半',
    share: (pct: number) => `占 IT ${pct.toFixed(1)} %`,
    summary: (gpu: string, it: string, facility: string) =>
      `功耗阶梯：每 GPU 实测 ${gpu} W，实测 IT ${it} W，数据中心 ${facility} W`,
  },
} as const;

const PAD = 4;
const GAP = 2;
const ROW = 15;
const CHAR = 6.6;
const RATED = 'var(--muted-foreground)';

/** Estimated label width; CJK glyphs render about twice as wide as Latin ones. */
const textWidth = (text: string) =>
  [...text].reduce((width, char) => width + (/\p{Script=Han}/u.test(char) ? 2 * CHAR : CHAR), 0);

interface LadderNumbers {
  gpu: number;
  it: number;
  facility: number;
  tdp: number;
  allIn: number;
  /** Watts per GPU of the board group, or null on hardware without one. */
  board: number | null;
  scaleMax: number;
}

type LadderLabel = StaggerLabel & { text: string; title: string };

function ladderLabels(
  t: (typeof STRINGS)[Locale],
  gpuTitle: string,
  width: number,
  numbers: LadderNumbers,
  pue: number,
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
    top.push({ key: 'gpu', x: PAD, anchor: 'start', text: gpuText, title: gpuTitle, width: 0 });
  }
  if (numbers.board !== null) {
    top.push({
      key: 'board',
      x: PAD,
      anchor: 'start',
      text: t.board(formatWatts(numbers.board)),
      title: t.boardTitle,
      width: 0,
    });
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
      text: t.facility(pue, formatWatts(numbers.facility)),
      title: t.facilityTitle,
      width: 0,
    },
  ];
  for (const label of [...top, ...bottom]) {
    label.width = textWidth(label.text);
    // Keep middle-anchored labels inside the frame.
    if (label.anchor === 'middle') {
      label.x = Math.min(Math.max(label.x, label.width / 2 + PAD), width - label.width / 2 - PAD);
    }
  }
  return { top, bottom, gpuText, px, xOf };
}

/**
 * Container widths the label rows snap to. A band lays its rows out at its lower edge, so the
 * ladder is one height across the band and container queries can reserve that height before the
 * width is measured: in the server render, while the point loads, and on the first client frame.
 */
const BANDS = [
  { min: 240, reserve: 'min-h-(--ladder-band-0)' },
  { min: 448, reserve: '@min-[448px]:min-h-(--ladder-band-1)' },
  { min: 576, reserve: '@min-[576px]:min-h-(--ladder-band-2)' },
  { min: 896, reserve: '@min-[896px]:min-h-(--ladder-band-3)' },
] as const;
const RESERVE = BANDS.map((band) => band.reserve).join(' ');

/**
 * Label rows, bar position and height for a ladder `width` px wide. Rows and the GPU label's
 * placement come from the final numbers so labels never hop mid-ease.
 */
function ladderLayout(ladder: Ladder, locale: Locale, width: number, compact: boolean) {
  const t = STRINGS[locale];
  const bandWidth = BANDS.findLast((band) => width >= band.min)?.min ?? BANDS[0].min;
  const scaleMax = Math.max(ladder.facilityWatts, ladder.allInWatts) * 1.03;
  const px = (bandWidth - 2 * PAD) / scaleMax;
  const gpuInline = ladder.gpuWatts * px >= textWidth(t.gpu(formatWatts(ladder.gpuWatts))) + 24;
  const labels = ladderLabels(
    t,
    '',
    bandWidth,
    {
      gpu: ladder.gpuWatts,
      it: ladder.itWatts,
      facility: ladder.facilityWatts,
      tdp: ladder.tdpWatts,
      allIn: ladder.allInWatts,
      board: ladder.board?.watts ?? null,
      scaleMax,
    },
    ladder.pue,
    gpuInline,
  );
  const topRows = staggerLabels(labels.top);
  const bottomRows = staggerLabels(labels.bottom);
  const topRowCount = Math.max(0, ...topRows.values()) + 1;
  const bottomRowCount = Math.max(0, ...bottomRows.values()) + 1;
  const barH = compact ? 26 : 34;
  // The board bracket sits between the top labels and the bar.
  const barY = topRowCount * ROW + (ladder.board ? 9 : 4);
  const tickY = barY + barH;
  return {
    gpuInline,
    topRows,
    bottomRows,
    barH,
    barY,
    tickY,
    height: tickY + 10 + bottomRowCount * ROW + 2,
  };
}

/** GPU draws the reserve covers, as fractions of TDP: where measured serving points sit. */
const RESERVE_DRAWS = Array.from({ length: 16 }, (_, index) => 0.3 + index * 0.05);

/**
 * Each band's tallest height across the GPU draws a point can take, as the custom properties the
 * reserve classes read. Label rows shift with the numbers, so the reserve follows the hardware
 * rather than the point: the loading placeholder and the measured ladder hold the same box.
 */
function bandHeights(
  hardware: LadderHardware,
  tdpWatts: number,
  locale: Locale,
  compact: boolean,
): CSSProperties {
  const ladders = RESERVE_DRAWS.map((draw) => buildLadder(hardware, tdpWatts * draw)).filter(
    (ladder) => ladder !== null,
  );
  return Object.fromEntries(
    BANDS.map((band, index) => [
      `--ladder-band-${index}`,
      `${Math.max(...ladders.map((ladder) => ladderLayout(ladder, locale, band.min, compact).height))}px`,
    ]),
  );
}

export interface PowerLadderProps {
  ladder: Ladder;
  color: string;
  locale: Locale;
  /** Without the parts list and with a shorter bar, for the worked example. */
  compact?: boolean;
  /** Build the ladder up in reading order the first time it scrolls into view. */
  build?: boolean;
  className?: string;
}

/**
 * The build reads the ladder in order: the measured GPU bar grows, the modeled parts fill in left
 * to right, then the PUE extension draws and the rated ticks fade in.
 */
const BUILD = { gpuMs: 700, stepMs: 60, partMs: 320, extensionMs: 400, ticksMs: 300 } as const;

export function PowerLadder({
  ladder,
  color,
  locale,
  compact = false,
  build = false,
  className,
}: PowerLadderProps) {
  const t = STRINGS[locale];
  const names = SYSTEM_POWER_CATEGORY_LABELS[locale];
  const titles = CATEGORY_TITLES[locale];
  const { setContainerRef, dimensions } = useResponsiveChartDimensions({ height: 1 });
  const width = Math.max(dimensions.width, 240);
  const targets: Record<string, number> = {
    scaleMax: Math.max(ladder.facilityWatts, ladder.allInWatts) * 1.03,
    facility: ladder.facilityWatts,
    tdp: ladder.tdpWatts,
    allIn: ladder.allInWatts,
  };
  for (const segment of ladder.segments) targets[`seg:${segment.category}`] = segment.watts;
  const boardCategories = new Set(ladder.board?.categories);
  const shown = useEasedValues(targets);
  const extensionStart =
    BUILD.gpuMs + Math.max(0, ladder.segments.length - 2) * BUILD.stepMs + BUILD.partMs;
  const ticksStart = extensionStart + BUILD.extensionMs - 100;
  const [buildRef, elapsed] = useBuildClock<SVGSVGElement>(build, ticksStart + BUILD.ticksMs);
  const grown = ladder.segments.map(
    (segment, index) =>
      (shown[`seg:${segment.category}`] ?? 0) *
      (index === 0
        ? stepProgress(elapsed, 0, BUILD.gpuMs)
        : stepProgress(elapsed, BUILD.gpuMs + (index - 1) * BUILD.stepMs, BUILD.partMs)),
  );
  const itShown = grown.reduce((sum, watts) => sum + watts, 0);
  const extension = stepProgress(elapsed, extensionStart, BUILD.extensionMs);
  const ticks = stepProgress(elapsed, ticksStart, BUILD.ticksMs);
  const gpuLabel = stepProgress(elapsed, BUILD.gpuMs * 0.45, 300);
  const facilityShown = itShown + extension * (shown.facility - itShown);
  const boardShown = ladder.segments.reduce(
    (sum, segment, index) => sum + (boardCategories.has(segment.category) ? grown[index] : 0),
    0,
  );
  const labelOpacity: Record<string, number> = {
    it: 1,
    gpu: gpuLabel,
    board: ticks,
    tdp: ticks,
    allIn: ticks,
    facility: extension,
  };

  const reserve = useMemo(
    () => bandHeights(ladder.hardware, ladder.tdpWatts, locale, compact),
    [ladder.hardware, ladder.tdpWatts, locale, compact],
  );
  const { gpuInline, topRows, bottomRows, barH, barY, tickY, height } = ladderLayout(
    ladder,
    locale,
    width,
    compact,
  );

  const live = ladderLabels(
    t,
    titles.gpu,
    width,
    {
      gpu: grown[0] ?? 0,
      it: itShown,
      facility: facilityShown,
      tdp: shown.tdp,
      allIn: shown.allIn,
      board: ladder.board ? boardShown : null,
      scaleMax: shown.scaleMax,
    },
    ladder.pue,
    gpuInline,
  );
  const { px, xOf } = live;
  const itX = xOf(itShown);
  const facilityX = xOf(facilityShown);

  let cursor = 0;
  const segments = ladder.segments.map((segment, index) => {
    const watts = grown[index];
    const x0 = xOf(cursor);
    cursor += watts;
    const w = Math.max(0, watts * px - GAP);
    return { ...segment, watts, x0, w, share: (segment.watts / ladder.itWatts) * 100 };
  });
  const boardEnd = xOf(boardShown) - GAP;

  return (
    <div ref={setContainerRef} className={cn('@container min-w-0', className)}>
      <div style={reserve} className={RESERVE}>
        {dimensions.width > 0 && (
          <svg
            ref={buildRef}
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

            {ladder.board && (
              <path
                data-board="bianca"
                d={`M${PAD},${barY - 2} V${barY - 6} H${boardEnd} V${barY - 2}`}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth={1}
                opacity={ticks}
              >
                <title>{t.boardTitle}</title>
              </path>
            )}

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
                opacity={gpuLabel}
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
                  opacity={ticks}
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
              opacity={extension}
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
        )}
      </div>

      {!compact && (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <li
              key={segment.category}
              title={`${t.share(segment.share)} — ${titles[segment.category]}`}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <GrammarSwatch kind={segment.kind} color={color} />
              <span className={segment.kind === 'measured' ? 'text-foreground' : undefined}>
                {names[segment.category]}
              </span>
              {/* One text node, so the unit does not slide as the number counts up. */}
              <span className="font-mono tabular-nums">{`${formatWatts(segment.watts)} W`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
