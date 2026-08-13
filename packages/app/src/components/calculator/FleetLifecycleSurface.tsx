'use client';

import { Canvas } from '@react-three/fiber';
import * as d3 from 'd3';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { useReducedMotion } from '@/components/inference/replay/useReducedMotion';
import { track } from '@/lib/analytics';
import { formatLargeNumber } from '@/lib/chart-rendering';
import { useLocale } from '@/lib/use-locale';

import type { SurfaceGrid } from './interactivity-surface';
import { DEFAULT_CAMERA, ORBIT_TARGET } from './surface/OrbitRig';
import {
  SurfaceScene,
  type ChromePalette,
  type HoverRead,
  type LabelSpec,
} from './surface/SurfaceScene';
import { toLinearHexish } from './surface/surfaceColors';
import { makeScales } from './surface/surfaceScales';
import { useWebglSupport } from './surface/useWebglSupport';

const STRINGS = {
  en: {
    noWebgl:
      'This view needs WebGL, which this browser has not made available. The 2D lifecycle chart above shows the same fleets at the selected interactivity.',
    tooLittle: 'Not enough measured coverage to build a surface at this power budget and scenario.',
    instructions:
      'Drag to rotate · Shift+Scroll to zoom · Double-click to reset · Hover a surface to read it',
    axisTime: 'Date',
    axisValue: 'Margin ($/day)',
    axisInteractivity: 'Interactivity (tok/s/user)',
    tipMargin: 'Margin/day',
    tipInteractivity: 'Interactivity',
    tipNearest: 'nearest measured sample',
    ariaSummary:
      'Three-dimensional surface: fleet margin per day over time and target interactivity, one surface per chip. Rotatable.',
    currentSlice: 'Slider interactivity',
    focusHint: 'Isolate a chip:',
    focusAll: 'All',
    holes:
      'Gaps are interactivity levels no run measured for that chip — reads outside a run’s measured range are excluded rather than extrapolated.',
  },
  zh: {
    noWebgl:
      '此视图需要 WebGL，但当前浏览器未提供。上方的二维生命周期图表展示了相同集群在所选交互性下的表现。',
    tooLittle: '在该功率预算与场景下，实测覆盖不足，无法构建曲面。',
    instructions: '拖动旋转 · Shift+滚轮 缩放 · 双击重置 · 悬停曲面可读取数值',
    axisTime: '日期',
    axisValue: '利润 ($/天)',
    axisInteractivity: '交互性 (tok/s/user)',
    tipMargin: '每日利润',
    tipInteractivity: '交互性',
    tipNearest: '最近的实测样本',
    ariaSummary: '三维曲面：集群每日利润随时间与目标交互性的变化，每款 Chip 一个曲面，可旋转。',
    currentSlice: '滑块交互性',
    focusHint: '单独查看某款 Chip：',
    focusAll: '全部',
    holes:
      '空缺处表示该 Chip 在这些交互性下没有任何实测数据——超出运行实测区间的结果会被排除，而不做外推。',
  },
} as const;

/** Signed money, negative rendered as -$X rather than $-X — matches the 2D chart. */
const money = (value: number) => `${value < 0 ? '-$' : '$'}${formatLargeNumber(Math.abs(value))}`;

const CHROME_VARS: Record<keyof ChromePalette, string> = {
  axis: '--border',
  grid: '--border-alt',
  breakEven: '--muted-foreground',
  sky: '--background',
  ground: '--card',
};

interface FleetLifecycleSurfaceProps {
  grid: SurfaceGrid;
  /** Dims all but one chip. Wired to the legend by the parent. */
  focusedKey?: string | null;
  /** Forces the fallback note — used by tests, and by anyone who wants 2D only. */
  disable3d?: boolean;
}

/**
 * The Fleet Lifecycle as a surface: margin over (time × interactivity), one shaded
 * surface per chip, rotatable.
 *
 * The 2D chart answers the question at one interactivity. This one shows that the
 * answer *has* a shape in that direction — a config that wins at 30 tok/s/user is
 * often not the one that wins at 150, so each chip's staircase is a ridge line
 * across the interactivity axis rather than a curve you could slide sideways.
 *
 * Deliberately a screen-only view: no PNG or CSV export. The export path clones the
 * DOM and re-renders it through html-to-image, and `cloneNode` does not carry a
 * canvas bitmap — a WebGL view would export as an empty rectangle. The 2D chart
 * above remains the exportable artefact.
 */
export default function FleetLifecycleSurface({
  grid,
  focusedKey: focusedKeyProp = null,
  disable3d = false,
}: FleetLifecycleSurfaceProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const support = useWebglSupport();
  const reduced = useReducedMotion();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<(HTMLElement | null)[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const draggingRef = useRef(false);
  const [hover, setHover] = useState<HoverRead | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * Which chip to isolate. Surfaces occlude each other from every angle — no camera
   * shows five at once, and under the site's vendor palette four of them are greens
   * — so isolating one is the highest-value control here, worth more than the
   * rotation. Seeded from the prop so a parent can drive it from a legend later.
   */
  const [focused, setFocused] = useState<string | null>(focusedKeyProp);
  const focusedKey = focusedKeyProp ?? focused;

  const scales = useMemo(
    () => makeScales({ times: grid.times, zs: grid.zs, yMin: grid.yMin, yMax: grid.yMax }),
    [grid.times, grid.zs, grid.yMin, grid.yMax],
  );

  const chrome = useMemo<ChromePalette>(() => {
    const read = (variable: string, fallback: string) => {
      if (typeof document === 'undefined') return fallback;
      const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
      // Every colour goes through the canvas probe: three.js cannot parse oklch()
      // and silently paints black, and this palette is oklch.
      return toLinearHexish(value || fallback, fallback);
    };
    return {
      axis: read(CHROME_VARS.axis, '#888888'),
      grid: read(CHROME_VARS.grid, '#666666'),
      breakEven: read(CHROME_VARS.breakEven, '#999999'),
      sky: read(CHROME_VARS.sky, '#ffffff'),
      ground: read(CHROME_VARS.ground, '#dddddd'),
    };
  }, []);

  /** Chip colours, resolved once through the same probe. */
  const chips = useMemo(
    () => grid.chips.map((chip) => ({ ...chip, color: toLinearHexish(chip.color) })),
    [grid.chips],
  );

  const labels = useMemo<LabelSpec[]>(() => {
    const specs: LabelSpec[] = [];
    const timeTicks = d3
      .scaleTime()
      .domain([new Date(grid.times[0] ?? 0), new Date(grid.times.at(-1) ?? 0)])
      .ticks(4);
    const formatTime = d3.timeFormat('%b %Y');
    for (const tick of timeTicks) {
      specs.push({
        id: `x-${tick.getTime()}`,
        text: formatTime(tick),
        axis: 'x',
        world: tick.getTime(),
      });
    }
    // Every third slice keeps the axis readable at 20 slices.
    for (let i = 0; i < grid.zs.length; i += 3) {
      const value = grid.zs[i]!;
      specs.push({
        id: `z-${i}`,
        text: value >= 100 ? value.toFixed(0) : value.toFixed(1),
        axis: 'z',
        world: value,
      });
    }
    for (const tick of d3.scaleLinear().domain([grid.yMin, grid.yMax]).ticks(4)) {
      specs.push({ id: `y-${tick}`, text: money(tick), axis: 'y', world: tick });
    }
    specs.push(
      { id: 'title-x', text: t.axisTime, axis: 'x', world: 0, title: true },
      { id: 'title-z', text: t.axisInteractivity, axis: 'z', world: 0, title: true },
      { id: 'title-y', text: t.axisValue, axis: 'y', world: 0, title: true },
    );
    return specs;
  }, [grid.times, grid.zs, grid.yMin, grid.yMax, t.axisTime, t.axisInteractivity, t.axisValue]);

  const onHover = useCallback((read: HoverRead | null) => {
    // Only re-render when the readout's content would actually change, so dragging
    // the pointer across one quad costs nothing.
    setHover((previous) => {
      if (!read) return previous === null ? previous : null;
      if (
        previous &&
        previous.chipKey === read.chipKey &&
        previous.cell?.zi === read.cell?.zi &&
        previous.cell?.ti === read.cell?.ti &&
        Math.abs(previous.value - read.value) < 1
      ) {
        return previous;
      }
      return read;
    });
  }, []);

  // Wheel gating matches the rest of the app: bare scroll belongs to the page,
  // shift+scroll zooms, and a trackpad pinch (ctrl+wheel) is rejected. Registered
  // on the wrapper so the capture phase provably runs before the canvas listener.
  const gateWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || event.ctrlKey) event.stopPropagation();
  }, []);

  const resetCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.object.position.set(...DEFAULT_CAMERA);
    controls.target.set(...ORBIT_TARGET);
    controls.update();
  }, []);

  if (disable3d || support === 'unavailable' || failed) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="calculator-lifecycle-surface-unavailable"
      >
        {t.noWebgl}
      </p>
    );
  }
  if (scales.degenerate || chips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-surface-thin">
        {t.tooLittle}
      </p>
    );
  }
  // Reserve the height while probing so expanding the section does not jump.
  if (support === 'probing') return <div className="h-105 w-full" aria-hidden />;

  const hoveredChip = hover ? chips.find((chip) => chip.key === hover.chipKey) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapperRef}
        onWheelCapture={gateWheel}
        onDoubleClick={resetCamera}
        className="relative h-105 w-full select-none overflow-hidden rounded-md"
        data-testid="calculator-lifecycle-surface"
        role="img"
        aria-label={t.ariaSummary}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: DEFAULT_CAMERA, fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', () => setFailed(true), {
              once: true,
            });
          }}
        >
          <SurfaceScene
            grid={grid}
            scales={scales}
            chips={chips}
            focusedKey={focusedKey}
            chrome={chrome}
            labels={labels}
            labelRefs={labelRefs}
            onHover={onHover}
            reduced={reduced}
            controlsRef={controlsRef}
            draggingRef={draggingRef}
          />
        </Canvas>

        {labels.map((label, index) => (
          <span
            key={label.id}
            ref={(element) => {
              labelRefs.current[index] = element;
            }}
            className={`pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[2px] bg-background/70 px-0.5 will-change-transform ${
              label.title
                ? 'text-[11px] font-medium text-foreground'
                : 'text-[10px] text-muted-foreground'
            }`}
            style={{ visibility: 'hidden' }}
          >
            {label.text}
          </span>
        ))}

        {hover && hoveredChip && (
          <div
            className="pointer-events-none absolute right-2 top-2 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm"
            data-testid="calculator-lifecycle-surface-readout"
          >
            <div className="mb-1 font-semibold" style={{ color: hoveredChip.color }}>
              {hoveredChip.label}
            </div>
            <div className="text-muted-foreground">
              {d3.timeFormat('%d %b %Y')(new Date(hover.ms))}
            </div>
            <div className="text-muted-foreground">
              {t.tipInteractivity}:{' '}
              {hover.interactivity.toFixed(hover.interactivity >= 100 ? 0 : 1)} tok/s/user
            </div>
            <div className="mt-1 font-medium">
              {t.tipMargin}: {money(hover.value)}
            </div>
            {hover.cell && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {t.tipNearest}:{' '}
                {d3.timeFormat('%d %b %Y')(new Date(grid.times[hover.cell.ti] ?? 0))}
                {' · '}
                {(grid.zs[hover.cell.zi] ?? 0).toFixed(1)} tok/s/user
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{t.focusHint}</span>
        <button
          type="button"
          aria-pressed={focused === null}
          data-testid="calculator-surface-focus-all"
          onClick={() => {
            setFocused(null);
            track('calculator_surface_focused', { chip: 'all' });
          }}
          className={`cursor-pointer rounded-sm border px-1.5 py-0.5 ${
            focused === null
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.focusAll}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={focused === chip.key}
            data-testid={`calculator-surface-focus-${chip.key}`}
            onClick={() => {
              const next = focused === chip.key ? null : chip.key;
              setFocused(next);
              track('calculator_surface_focused', { chip: next ?? 'all' });
            }}
            className={`cursor-pointer rounded-sm border px-1.5 py-0.5 ${
              focused === chip.key
                ? 'border-current'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
            style={{ color: chip.color }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <p className="no-export text-center text-xs text-muted-foreground">{t.instructions}</p>
      <p className="text-xs text-muted-foreground">
        {t.currentSlice}: {grid.currentZ.toFixed(grid.currentZ >= 100 ? 0 : 1)} tok/s/user ·{' '}
        {t.holes}
      </p>
    </div>
  );
}
