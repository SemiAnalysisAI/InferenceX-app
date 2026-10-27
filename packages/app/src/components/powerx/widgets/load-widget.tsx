'use client';

import { useMemo } from 'react';

import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import {
  buildLadder,
  LADDER_HARDWARE,
  ladderLabel,
  loadSweep,
  snapLoadWatts,
  trackMoves,
} from '@/lib/powerx/ladder';
import { cn } from '@/lib/shared/utils';

import { hardwareStore } from './hardware-store';
import { inViewAttr, motionVars, useCountUp, useInView, useReducedMotion } from './motion';
import { GROUP_LABELS, GROUP_TITLES } from './strings';
import {
  formatWatts,
  GrammarSwatch,
  useHydrated,
  useWidgetHash,
  WidgetFrame,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    slider: 'GPU power',
    readout: (watts: string, pct: number) => `${watts} W · ${pct.toFixed(0)} % of TDP`,
    idle: '0 W',
    tdp: (watts: string) => `TDP ${watts} W`,
    follows: 'follows the GPU',
    flat: 'flat',
    input: 'measured input',
    it: (watts: string) => `IT ${watts} W per GPU`,
    chip: (label: string) => `${label}, agentic state, single chassis`,
  },
  zh: {
    slider: 'GPU 功耗',
    readout: (watts: string, pct: number) => `${watts} W · TDP 的 ${pct.toFixed(0)} %`,
    idle: '0 W',
    tdp: (watts: string) => `TDP ${watts} W`,
    follows: '随 GPU 变化',
    flat: '固定',
    input: '实测输入',
    it: (watts: string) => `每 GPU IT ${watts} W`,
    chip: (label: string) => `${label}，智能体状态，单机箱`,
  },
} as const;

const HASH_KEY = 'ld';
const SPARK_W = 136;
const SPARK_H = 40;
/** Sparklines draw in 50 ms apart once the strip is on screen; slider changes ease in 200 ms. */
const SPARK_STAGGER_MS = 50;
const SPARK_DRAW_MS = 700;
const SLIDE_MS = 200;

/** One watt readout that counts up on first view and eases to each new value. */
function Watts({
  value,
  active,
  delayMs = 0,
}: {
  value: number;
  active: boolean;
  delayMs?: number;
}) {
  const reduced = useReducedMotion();
  const shown = useCountUp(value, {
    active,
    reduced,
    delayMs,
    durationMs: 700,
    updateMs: SLIDE_MS,
  });
  return <>{formatWatts(shown)}</>;
}

export function LoadWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [hardware] = hardwareStore.use();
  const [raw, setRaw] = useWidgetHash<string | null>(
    HASH_KEY,
    (value) => value ?? '',
    (value) => value,
  );
  const gpuWatts = snapLoadWatts(raw, hardware);
  const sweep = useMemo(() => loadSweep(hardware, 25), [hardware]);
  const ladder = useMemo(() => buildLadder(hardware, gpuWatts), [hardware, gpuWatts]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    activeKeys: [...LADDER_HARDWARE],
  });
  const hydrated = useHydrated();
  const color = hydrated ? resolveColor(hardware) : 'var(--foreground)';
  const groups = GROUP_LABELS[locale];
  const titles = GROUP_TITLES[locale];
  const fraction = gpuWatts / sweep.tdpWatts;
  const reduced = useReducedMotion();
  const [stripRef, stripInView] = useInView<HTMLUListElement>({ threshold: 0.3 });
  const revealed = inViewAttr(stripInView);
  const shownGpuWatts = useCountUp(gpuWatts, { reduced, durationMs: 0, updateMs: SLIDE_MS });
  const shownFraction = shownGpuWatts / sweep.tdpWatts;
  const shownItWatts = useCountUp(ladder?.itWatts ?? 0, {
    reduced,
    durationMs: 0,
    updateMs: SLIDE_MS,
  });

  return (
    <WidgetFrame name="load" alt={alt}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <span className="shrink-0 text-sm font-medium text-foreground">{t.slider}</span>
          <input
            type="range"
            min={0}
            max={sweep.tdpWatts}
            step={10}
            value={gpuWatts}
            aria-valuetext={t.readout(formatWatts(gpuWatts), fraction * 100)}
            onChange={(event) => {
              setRaw(event.target.value);
              track('powerx_tutorial_load_watts', { value: Number(event.target.value) });
            }}
            className="h-11 min-w-0 flex-1 accent-foreground md:h-9"
          />
        </label>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {t.readout(formatWatts(shownGpuWatts), shownFraction * 100)}
        </span>
      </div>
      <p
        className="mt-2 font-mono text-xs text-muted-foreground"
        title={t.chip(ladderLabel(hardware))}
        data-testid="powerx-load-context"
      >
        {ladderLabel(hardware)} · {ladder ? t.it(formatWatts(shownItWatts)) : ''}
      </p>

      <ul ref={stripRef} className="mt-5 flex flex-wrap gap-x-7 gap-y-5">
        {sweep.tracks.map((trackRow, trackIndex) => {
          const current =
            ladder?.segments.find((segment) => segment.group === trackRow.group)?.watts ?? 0;
          const max = Math.max(...trackRow.values, 1);
          const moves = trackMoves(trackRow.values);
          const path = trackRow.values
            .map((value, index) => {
              const x = (index / (trackRow.values.length - 1)) * SPARK_W;
              const y = SPARK_H - (value / max) * (SPARK_H - 4) - 2;
              return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
          const cx = fraction * SPARK_W;
          const cy = SPARK_H - (current / max) * (SPARK_H - 4) - 2;
          const measured = trackRow.kind === 'measured';
          const delayMs = trackIndex * SPARK_STAGGER_MS;
          return (
            <li key={trackRow.group} title={titles[trackRow.group]} className="w-34 shrink-0">
              <p
                className={cn(
                  'flex items-center gap-1.5 truncate text-xs',
                  measured ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <GrammarSwatch kind={trackRow.kind} color={color} />
                {groups[trackRow.group]}
              </p>
              <svg
                width={SPARK_W}
                height={SPARK_H}
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                aria-hidden="true"
                className="mt-1 block max-w-full overflow-visible"
              >
                <path
                  d={`${path} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`}
                  fill={color}
                  fillOpacity={measured ? 0.22 : 0.1}
                  data-fade=""
                  data-inview={revealed}
                  style={motionVars({ delayMs: delayMs + SPARK_DRAW_MS * 0.4 })}
                />
                <path
                  d={path}
                  pathLength={1}
                  fill="none"
                  stroke={color}
                  strokeWidth={measured ? 2 : 1.5}
                  data-draw=""
                  data-inview={revealed}
                  style={motionVars({ delayMs, drawMs: SPARK_DRAW_MS })}
                />
                <g
                  data-fade=""
                  data-inview={revealed}
                  style={motionVars({ delayMs: delayMs + SPARK_DRAW_MS * 0.6 })}
                >
                  <line
                    x1={0}
                    x2={0}
                    y1={0}
                    y2={SPARK_H}
                    stroke="var(--foreground)"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                    className="motion-move"
                    style={{ transform: `translateX(${cx}px)` }}
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={4}
                    fill={measured ? color : 'var(--background)'}
                    stroke={measured ? 'var(--background)' : color}
                    strokeWidth={measured ? 2 : 1.5}
                    className="motion-move"
                    style={{ transform: `translate(${cx}px, ${cy}px)` }}
                  />
                </g>
              </svg>
              <p className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">
                  <Watts value={current} active={stripInView} delayMs={delayMs} /> W
                </span>
                <span>{measured ? t.input : moves ? t.follows : t.flat}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </WidgetFrame>
  );
}
