import * as d3 from 'd3';

import { formatLargeNumber, logTickFormat } from '@/lib/chart-rendering';
import {
  paretoFrontLowerLeft,
  paretoFrontLowerRight,
  paretoFrontUpperLeft,
  paretoFrontUpperRight,
} from '@/lib/chart-utils';
import { getHardwareConfig } from '@/lib/constants';
import { createLogoWatermark } from '@/lib/d3-chart/watermark';
import { getDisplayLabel } from '@/lib/utils';

import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';

import type { ReplayTimeline } from './buildReplayTimeline';
import { interpolateAtStep } from './interpolateAtTime';

export type RooflineDirection = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

interface MutableConfig {
  configId: string;
  hwKey: string;
  precision: string;
  template: InferenceData;
  visible: boolean;
  x: number;
  y: number;
}

export interface ReplayControllerOptions {
  /** SVG element the controller will own end-to-end. */
  svg: SVGSVGElement;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  xLabel: string;
  yLabel: string;
  timeline: ReplayTimeline;
  rooflineDirection: RooflineDirection;
  /** Color for an hwKey. Read every tick (no closure freezing). */
  getColor: (hwKey: string) => string;
  /** Whether an hwKey passes the user's legend filter. Read every tick. */
  isHwActive: (hwKey: string) => boolean;
  /** "Optimal only" toggle. Read every tick. */
  isHideNonOptimal: () => boolean;
  /** Log-scale toggle. Read every tick. */
  isLogScale: () => boolean;
  /** Currently-selected precisions. Read every tick. */
  selectedPrecisions: () => readonly string[];
  /** Whether to suppress per-dot text labels. Read every tick. */
  hidePointLabels: () => boolean;
  /** Use the longer TEP/EP/DPAEP label format vs. plain TP. */
  useAdvancedLabels: () => boolean;
  /** Whether to render per-roofline hw labels along each line. Read every tick. */
  showLineLabels: () => boolean;
  /** Used by the line-label placement algorithm to pick interactivity-vs-endpoint style. */
  chartType: 'e2e' | 'interactivity';
  /** Throttled ~10 Hz callback with the current observed-date label, fraction-of-playback, and step index. */
  onFrame?: (currentDate: string, fraction: number, stepIndex: number) => void;
  /** Fired once when playback reaches the end. */
  onComplete?: () => void;
}

const PARETO_FN: Record<RooflineDirection, typeof paretoFrontUpperLeft> = {
  upper_left: paretoFrontUpperLeft,
  upper_right: paretoFrontUpperRight,
  lower_left: paretoFrontLowerLeft,
  lower_right: paretoFrontLowerRight,
};

const PAD_LINEAR = 0.08;
const PAD_LOG = 1.18;

function padDomain(min: number, max: number, log: boolean): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return log ? [0.001, 1] : [0, 1];
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return [min - pad, max + pad];
  }
  if (log) {
    if (min <= 0) return [Math.max(0.001, max / 1000), max * PAD_LOG];
    return [min / PAD_LOG, max * PAD_LOG];
  }
  const span = max - min;
  const pad = span * PAD_LINEAR;
  return [min >= 0 ? Math.max(0, min - pad) : min - pad, max + pad];
}

/**
 * Self-contained replay chart. Builds its own SVG structure (clip-path,
 * grid/axis groups, zoom group with dots + rooflines) once on construction,
 * then redraws everything imperatively per tick — no React re-renders for
 * axes, scales, or layers. The panel only owns control-bar state.
 *
 * Lifecycle:
 *   - constructor — builds structure, renders frame 0
 *   - play() / pause() — toggle the rAF loop
 *   - seekToFraction(t) — jump to a position (paused)
 *   - renderFrame(t) — synchronous deterministic render (used by exporter)
 *   - setSpeed(n) — change playback multiplier
 *   - dispose() — cancel rAF, wipe the SVG
 */
export class ReplayController {
  private opts: ReplayControllerOptions;
  private innerWidth: number;
  private innerHeight: number;
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gridGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private xAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private yAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private rooflinesGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private dotsGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private lineLabelsGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private dateOverlay: d3.Selection<SVGTextElement, unknown, null, undefined>;
  private configs: MutableConfig[];
  private fraction = 0;
  private speed = 1;
  private playing = false;
  private rafId: number | null = null;
  private lastTickAt = 0;
  private lastBroadcastAt = 0;

  constructor(opts: ReplayControllerOptions) {
    this.opts = opts;
    this.innerWidth = Math.max(0, opts.width - opts.margin.left - opts.margin.right);
    this.innerHeight = Math.max(0, opts.height - opts.margin.top - opts.margin.bottom);

    this.configs = opts.timeline.configs.map((c) => ({
      configId: c.configId,
      hwKey: c.hwKey,
      precision: c.precision,
      template: c.template,
      visible: false,
      x: 0,
      y: 0,
    }));

    const svg = d3.select(opts.svg);
    svg.selectAll('*').remove();
    svg.attr('width', opts.width).attr('height', opts.height);

    const chartHash = Math.random().toString(36).slice(2, 9);
    const clipId = `replay-clip-${chartHash}`;
    const defs = svg.append('defs');
    defs
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', this.innerWidth)
      .attr('height', this.innerHeight);

    // InferenceX logo watermark behind the data, matching the main charts.
    createLogoWatermark(
      svg,
      defs,
      opts.width,
      opts.height,
      this.innerWidth,
      this.innerHeight,
      opts.margin,
      `replay-${chartHash}`,
    );

    this.rootGroup = svg
      .append('g')
      .attr('class', 'chart-root')
      .attr('transform', `translate(${opts.margin.left},${opts.margin.top})`);

    this.gridGroup = this.rootGroup.append('g').attr('class', 'grid');
    this.xAxisGroup = this.rootGroup
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${this.innerHeight})`);
    this.yAxisGroup = this.rootGroup.append('g').attr('class', 'y-axis');

    svg
      .append('text')
      .attr('class', 'x-axis-label')
      .attr('x', opts.margin.left + this.innerWidth / 2)
      .attr('y', opts.height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text(opts.xLabel);
    svg
      .append('text')
      .attr('class', 'y-axis-label')
      .attr('transform', `translate(16,${opts.margin.top + this.innerHeight / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text(opts.yLabel);

    const zoomGroup = this.rootGroup.append('g').attr('clip-path', `url(#${clipId})`);
    this.rooflinesGroup = zoomGroup.append('g').attr('class', 'rooflines');
    this.dotsGroup = zoomGroup.append('g').attr('class', 'dots');
    this.lineLabelsGroup = zoomGroup.append('g').attr('class', 'line-labels');

    // Big date overlay rendered into the SVG so it shows in MP4 frames too.
    this.dateOverlay = this.rootGroup
      .append('text')
      .attr('class', 'replay-date-overlay')
      .attr('x', this.innerWidth - 8)
      .attr('y', 28)
      .attr('text-anchor', 'end')
      .attr('font-size', '28px')
      .attr('font-weight', '700')
      .attr('fill', 'var(--foreground)')
      .style('opacity', 0.85)
      .style('font-variant-numeric', 'tabular-nums')
      .text('');

    this.renderCurrent();
  }

  private spanMs(): number {
    // Total wall-clock duration at 1× speed. ~800 ms per observed step gives
    // each transition room to read; capped at 30 s so very long histories
    // still finish in a reasonable time.
    const n = this.opts.timeline.dates.length;
    if (n <= 1) return 1500;
    return Math.min(30_000, Math.max(4500, n * 800));
  }

  private stepFloatAtFraction(t: number): number {
    const n = this.opts.timeline.dates.length;
    if (n <= 1) return 0;
    const raw = Math.max(0, Math.min(1, t)) * (n - 1);
    // Cubic ease-in-out per segment: dots and rooflines settle on observed
    // dates and accelerate between them, instead of cruising at constant
    // speed. The integer parts of `raw` are preserved (segment boundaries are
    // still aligned with observed dates) — only the fractional part is eased.
    const idxLow = Math.floor(raw);
    const segFrac = raw - idxLow;
    const eased = segFrac < 0.5 ? 4 * segFrac ** 3 : 1 - (-2 * segFrac + 2) ** 3 / 2;
    return idxLow + eased;
  }

  setSpeed(s: number): void {
    this.speed = Math.max(0.1, Math.min(8, s));
  }

  getSpeed(): number {
    return this.speed;
  }

  /** Wall-clock duration of a full playback at the controller's current speed. */
  getDurationMs(): number {
    return this.spanMs() / this.speed;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getFraction(): number {
    return this.fraction;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    if (this.fraction >= 1) this.fraction = 0;
    this.lastTickAt = performance.now();
    this.scheduleTick();
  }

  pause(): void {
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  seekToFraction(t: number): void {
    this.pause();
    this.fraction = Math.max(0, Math.min(1, t));
    this.renderCurrent();
    this.broadcast();
  }

  /** Synchronous render at a logical fraction. Used by the MP4 exporter. */
  renderFrame(t: number): void {
    this.fraction = Math.max(0, Math.min(1, t));
    this.renderCurrent();
  }

  dispose(): void {
    this.pause();
    d3.select(this.opts.svg).selectAll('*').remove();
  }

  private scheduleTick(): void {
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const dt = now - this.lastTickAt;
    this.lastTickAt = now;
    this.fraction = Math.min(1, this.fraction + (dt / this.spanMs()) * this.speed);

    this.renderCurrent();

    if (now - this.lastBroadcastAt > 100) {
      this.lastBroadcastAt = now;
      this.broadcast();
    }

    if (this.fraction >= 1) {
      this.playing = false;
      this.broadcast();
      this.opts.onComplete?.();
      return;
    }
    this.scheduleTick();
  };

  private broadcast(): void {
    const idxFloat = this.stepFloatAtFraction(this.fraction);
    const step = Math.round(idxFloat);
    const date =
      this.opts.timeline.dates[Math.max(0, Math.min(this.opts.timeline.dates.length - 1, step))] ??
      '';
    this.opts.onFrame?.(date, this.fraction, step);
  }

  private renderCurrent(): void {
    const {
      timeline,
      isHwActive,
      isHideNonOptimal,
      isLogScale,
      getColor,
      rooflineDirection,
      selectedPrecisions,
      hidePointLabels,
      useAdvancedLabels,
      showLineLabels,
      chartType,
    } = this.opts;
    const idxFloat = this.stepFloatAtFraction(this.fraction);

    // 1. Interpolate per-config positions and compute the visible bounding box.
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    const visibleConfigs: MutableConfig[] = [];
    const precisions = selectedPrecisions();

    for (let i = 0; i < this.configs.length; i++) {
      const orig = timeline.configs[i];
      const m = this.configs[i];
      const r = interpolateAtStep(orig.stepValues, idxFloat);
      m.x = r.x;
      m.y = r.y;
      m.visible = r.visible && isHwActive(m.hwKey) && precisions.includes(m.precision);
      if (m.visible) {
        visibleConfigs.push(m);
        if (m.x < xMin) xMin = m.x;
        if (m.x > xMax) xMax = m.x;
        if (m.y < yMin) yMin = m.y;
        if (m.y > yMax) yMax = m.y;
      }
    }

    // 2. Domain + scales (recomputed every tick — that's the point).
    const log = isLogScale();
    const xScale = log
      ? d3
          .scaleLog()
          .domain(padDomain(xMin, xMax, true))
          .range([0, this.innerWidth])
          .nice()
      : d3
          .scaleLinear()
          .domain(padDomain(xMin, xMax, false))
          .range([0, this.innerWidth])
          .nice();
    const yScale = log
      ? d3
          .scaleLog()
          .domain(padDomain(yMin, yMax, true))
          .range([this.innerHeight, 0])
          .nice()
      : d3
          .scaleLinear()
          .domain(padDomain(yMin, yMax, false))
          .range([this.innerHeight, 0])
          .nice();

    // 3. Axes.
    const xAxis = log
      ? d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat(logTickFormat(xScale as d3.ScaleLogarithmic<number, number>))
      : d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat((d) => formatLargeNumber(d as number));
    const yAxis = log
      ? d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat(logTickFormat(yScale as d3.ScaleLogarithmic<number, number>))
      : d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) => formatLargeNumber(d as number));
    this.xAxisGroup.call(xAxis as any);
    this.yAxisGroup.call(yAxis as any);

    // 4. Grid lines.
    const xTicks = xScale.ticks(6);
    const yTicks = yScale.ticks(5);
    // No inline stroke — the global stylesheet styles `.chart-root .grid line`
    // with `stroke: var(--border-alt)` so replay gridlines match the rest of
    // the dashboard. Inline attrs would defeat that.
    const gridX = this.gridGroup.selectAll<SVGLineElement, number>('.grid-x').data(xTicks);
    gridX.exit().remove();
    gridX
      .enter()
      .append('line')
      .attr('class', 'grid-x')
      .merge(gridX as any)
      .attr('x1', (d: number) => xScale(d) ?? 0)
      .attr('x2', (d: number) => xScale(d) ?? 0)
      .attr('y1', 0)
      .attr('y2', this.innerHeight);
    const gridY = this.gridGroup.selectAll<SVGLineElement, number>('.grid-y').data(yTicks);
    gridY.exit().remove();
    gridY
      .enter()
      .append('line')
      .attr('class', 'grid-y')
      .merge(gridY as any)
      .attr('x1', 0)
      .attr('x2', this.innerWidth)
      .attr('y1', (d: number) => yScale(d) ?? 0)
      .attr('y2', (d: number) => yScale(d) ?? 0);

    // 5. Pareto + rooflines.
    const byHw = new Map<string, MutableConfig[]>();
    for (const c of visibleConfigs) {
      let bucket = byHw.get(c.hwKey);
      if (!bucket) {
        bucket = [];
        byHw.set(c.hwKey, bucket);
      }
      bucket.push(c);
    }
    const paretoFn = PARETO_FN[rooflineDirection];
    interface RoofEntry {
      hw: string;
      pts: { x: number; y: number; src: MutableConfig }[];
    }
    const rooflines: RoofEntry[] = [];
    const optimalSet = new Set<MutableConfig>();
    for (const [hw, pts] of byHw) {
      if (pts.length < 2) continue;
      const front = paretoFn(
        pts.map((p) => ({ x: p.x, y: p.y, src: p }) as unknown as InferenceData),
      ) as unknown as { x: number; y: number; src: MutableConfig }[];
      front.sort((a, b) => a.x - b.x);
      if (front.length >= 2) {
        rooflines.push({ hw, pts: front });
        for (const p of front) optimalSet.add(p.src);
      }
    }
    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => xScale(d.x) ?? 0)
      .y((d) => yScale(d.y) ?? 0)
      .curve(d3.curveMonotoneX);

    const roofSel = this.rooflinesGroup
      .selectAll<SVGPathElement, RoofEntry>('.replay-roofline')
      .data(rooflines, (d) => d.hw);
    roofSel.exit().remove();
    const roofEnter = roofSel
      .enter()
      .append('path')
      .attr('class', 'replay-roofline')
      .attr('fill', 'none');
    roofEnter
      .merge(roofSel as any)
      .attr('stroke', (d: RoofEntry) => getColor(d.hw))
      .attr('stroke-width', 2)
      .attr('d', (d: RoofEntry) => lineGen(d.pts) ?? '');

    // 6. Dots.
    const hideNonOptimal = isHideNonOptimal();
    const dotData = visibleConfigs.filter((c) => !hideNonOptimal || optimalSet.has(c));
    const dotSel = this.dotsGroup
      .selectAll<SVGGElement, MutableConfig>('.replay-dot-group')
      .data(dotData, (d) => d.configId);
    dotSel.exit().remove();
    const dotEnter = dotSel.enter().append('g').attr('class', 'replay-dot-group');
    dotEnter.append('circle').attr('class', 'replay-dot').attr('r', 5);
    dotEnter
      .append('text')
      .attr('class', 'replay-dot-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('pointer-events', 'none')
      .attr('fill', 'var(--foreground)')
      .attr('dy', -8);

    const merged = dotEnter.merge(dotSel as any);
    merged.attr('transform', (d: MutableConfig) => `translate(${xScale(d.x)},${yScale(d.y)})`);
    merged.select('.replay-dot').attr('fill', (d: MutableConfig) => getColor(d.hwKey));

    // 7. Labels.
    const hide = hidePointLabels();
    const advanced = useAdvancedLabels();
    merged
      .select<SVGTextElement>('.replay-dot-label')
      .style('display', hide ? 'none' : 'block')
      .text((d: MutableConfig) =>
        hide ? '' : advanced ? getPointLabel(d.template) : String(d.template.tp),
      );

    // 8. Line labels — one label per hw roofline, placed along the line
    // (interactivity charts use greedy collision avoidance, e2e/ttft uses
    // endpoint labels with vertical de-overlap). Mirrors ScatterGraph.
    interface LineLabel {
      key: string;
      label: string;
      color: string;
      x: number;
      y: number;
      visible: boolean;
    }
    const lineLabels: LineLabel[] = [];
    if (showLineLabels() && rooflines.length > 0) {
      const LABEL_H = 18;
      const LABEL_W = 120;
      if (chartType === 'interactivity') {
        const placed: { x: number; y: number }[] = [];
        const collides = (cx: number, cy: number) =>
          placed.some((p) => Math.abs(p.y - cy) < LABEL_H && Math.abs(p.x - cx) < LABEL_W);
        const sorted = [...rooflines].toSorted(
          (a, b) => (yScale(a.pts[0].y) ?? 0) - (yScale(b.pts[0].y) ?? 0),
        );
        for (const entry of sorted) {
          const pts = entry.pts;
          const label = getDisplayLabel(getHardwareConfig(entry.hw));
          const candidates = [
            pts[Math.min(1, pts.length - 1)],
            pts[Math.floor(pts.length / 2)],
            pts[Math.max(0, Math.floor((pts.length * 2) / 3))],
            pts.at(-1)!,
          ];
          let foundPlacement = false;
          for (const pt of candidates) {
            const px = xScale(pt.x) ?? 0;
            const py = yScale(pt.y) ?? 0;
            if (!collides(px, py)) {
              lineLabels.push({
                key: entry.hw,
                label,
                color: getColor(entry.hw),
                x: px,
                y: py,
                visible: true,
              });
              placed.push({ x: px, y: py });
              foundPlacement = true;
              break;
            }
          }
          if (!foundPlacement) {
            const pt = pts[0];
            lineLabels.push({
              key: entry.hw,
              label,
              color: getColor(entry.hw),
              x: xScale(pt.x) ?? 0,
              y: yScale(pt.y) ?? 0,
              visible: false,
            });
          }
        }
      } else {
        for (const entry of rooflines) {
          const pt = entry.pts.at(-1)!;
          lineLabels.push({
            key: entry.hw,
            label: getDisplayLabel(getHardwareConfig(entry.hw)),
            color: getColor(entry.hw),
            x: xScale(pt.x) ?? 0,
            y: yScale(pt.y) ?? 0,
            visible: true,
          });
        }
        const yRange = yScale.range();
        const top = Math.min(yRange[0], yRange[1]) + LABEL_H;
        const bottom = Math.max(yRange[0], yRange[1]) - LABEL_H;
        lineLabels.sort((a, b) => a.y - b.y);
        for (let pass = 0; pass < 5; pass++) {
          for (let i = 1; i < lineLabels.length; i++) {
            const overlap = lineLabels[i - 1].y + LABEL_H - lineLabels[i].y;
            if (overlap > 0) {
              const half = overlap / 2;
              lineLabels[i - 1].y -= half;
              lineLabels[i].y += half;
            }
          }
          for (const l of lineLabels) {
            l.y = Math.max(top, Math.min(bottom, l.y));
          }
        }
      }
    }

    const labelSel = this.lineLabelsGroup
      .selectAll<SVGGElement, LineLabel>('.replay-line-label')
      .data(lineLabels, (d) => d.key);
    labelSel.exit().remove();
    const labelEnter = labelSel
      .enter()
      .append('g')
      .attr('class', 'replay-line-label')
      .style('pointer-events', 'none');
    labelEnter.append('rect').attr('rx', 4).attr('ry', 4).attr('opacity', 0.95);
    labelEnter
      .append('text')
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', '10px')
      .attr('font-weight', '600');
    const labelMerged = labelEnter.merge(labelSel as any);
    labelMerged
      .attr('transform', (d: LineLabel) => `translate(${d.x + 8},${d.y - 14})`)
      .style('opacity', (d: LineLabel) => (d.visible ? 1 : 0));
    labelMerged.each(function (d: LineLabel) {
      const g = d3.select(this);
      const text = g.select<SVGTextElement>('text').text(d.label);
      const bbox = (text.node() as SVGTextElement).getBBox();
      const px = 5;
      const py = 3;
      g.select('rect')
        .attr('x', bbox.x - px)
        .attr('y', bbox.y - py)
        .attr('width', bbox.width + px * 2)
        .attr('height', bbox.height + py * 2)
        .attr('fill', d.color);
    });

    // 9. Date overlay — rendered into the SVG so it shows in MP4 frames too.
    const dates = timeline.dates;
    if (dates.length > 0) {
      const stepRound = Math.max(0, Math.min(dates.length - 1, Math.round(idxFloat)));
      this.dateOverlay.text(dates[stepRound]);
    } else {
      this.dateOverlay.text('');
    }
  }
}
