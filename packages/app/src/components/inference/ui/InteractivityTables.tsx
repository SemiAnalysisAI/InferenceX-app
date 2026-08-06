'use client';

import { useMemo, useState } from 'react';
import { HelpCircle } from 'lucide-react';

import { useInference } from '@/components/inference/InferenceContext';
import type { InferenceData } from '@/components/inference/types';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { track } from '@/lib/analytics';
import { getHardwareConfig } from '@/lib/constants';
import { getMetricParetoDirection } from '@/lib/metric-direction';
import {
  aucUnderFrontier,
  aucWindow,
  interpAlongFrontier,
  paretoFrontier,
  type ParetoDirection,
  type Point2D,
} from '@/lib/pareto';
import { cn, getDisplayLabel } from '@/lib/utils';

/**
 * Default baseline preferences. We resolve to whichever enabled config best
 * matches each name; if none match we fall back to the first enabled config.
 */
const DEFAULT_THROUGHPUT_BASELINE_HINTS = ['mi355x_sglang'];
const DEFAULT_AUC_PRIMARY_HINTS = ['b200_sglang'];
const DEFAULT_AUC_SECONDARY_HINTS = ['mi355x_sglang'];
const DEFAULT_AUC_TERTIARY_HINTS = ['mi355x_atom'];

interface ConfigSeries {
  hwKey: string;
  label: string;
  frontier: Point2D[];
}

/**
 * Pick the enabled hwKey whose lowercase string contains all hint tokens
 * (e.g. 'mi355x_sglang' matches 'mi355x_sglang' but NOT 'mi355x_sglang_mtp').
 * The hint should NOT match the `_mtp` variant by default — we prefer the
 * non-MTP entry. Returns null when no enabled config matches.
 */
function pickDefaultBaseline(
  enabledKeys: string[],
  hints: string[],
  excludeMtp = true,
): string | null {
  for (const hint of hints) {
    const lcHint = hint.toLowerCase();
    const match = enabledKeys.find((k) => {
      const lc = k.toLowerCase();
      if (!lc.includes(lcHint)) return false;
      if (excludeMtp && lc.endsWith('_mtp')) return false;
      return true;
    });
    if (match) return match;
  }
  return null;
}

/** Format a number with the right scale for the chosen metric. */
function formatValue(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs >= 1000) return Math.round(n).toLocaleString();
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  return n.toExponential(2);
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance for an sRGB color. */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

// Saturation endpoints for the ratio→color ramp. The dataset can show ratios
// up to ~30× between best and worst configs (e.g. GB300 vs MI355X SGL), so
// caps must be wide enough that common ratios (2×, 5×, 10×, 20×) sit at
// visibly different points on the ramp rather than all clamping to the same
// extreme. Stays log-symmetric: t=+1 at RATIO_CAP_HI, t=-1 at RATIO_CAP_LO.
export const RATIO_CAP_HI = 30;
export const RATIO_CAP_LO = 1 / 30;

/** HSL → RGB. h in [0, 360), s/l in [0, 1]. Returns integer [0,255] channels. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// HSL endpoints. Lightness ramps 0.97 (near-white at t=0) down to 0.28 (deep
// color at |t|=1); saturation eases up so the deep end stays vivid. RGB
// interpolation collapses perceptually between green-300 and green-700, so we
// drive the ramp in HSL instead — this is what gives 5× / 10× / 20× / 33×
// visibly different greens.
const HUE_GREEN = 142; // tailwind green-ish
const HUE_RED = 0;
const L_NEUTRAL = 0.97;
const L_DEEP = 0.28;
const S_NEUTRAL = 0.6;
const S_DEEP = 0.78;

/**
 * Map a ratio (other / baseline) to a red→white→green color, centered at 1.0×
 * and log-symmetric.
 *
 * For 'higher' (default): ratio = 1 → near-white; ratio ≥ RATIO_CAP_HI → deep
 * green; ratio ≤ RATIO_CAP_LO → deep red.
 *
 * For 'lower': INVERT — ratio ≤ RATIO_CAP_LO → deep green; ratio ≥
 * RATIO_CAP_HI → deep red.
 *
 * Returns { background, color } with the WCAG-derived text color.
 */
export function ratioColor(
  ratio: number,
  direction: ParetoDirection = 'higher',
): { background: string; color: string } {
  const clamped = Math.max(RATIO_CAP_LO, Math.min(RATIO_CAP_HI, ratio));
  // log-symmetric t in [-1, 1]: t=0 at 1.0, t=+1 at cap-hi, t=-1 at cap-lo.
  let t = Math.log(clamped) / Math.log(RATIO_CAP_HI);
  // For lower-is-better, flip the sign so ratio > 1 → red and ratio < 1 → green.
  if (direction === 'lower') t = -t;
  const magnitude = Math.abs(t);
  const hue = t >= 0 ? HUE_GREEN : HUE_RED;
  const lightness = L_NEUTRAL + (L_DEEP - L_NEUTRAL) * magnitude;
  const saturation = S_NEUTRAL + (S_DEEP - S_NEUTRAL) * magnitude;
  const { r, g, b } = hslToRgb(hue, saturation, lightness);
  const lum = relativeLuminance(r, g, b);
  const color = lum > 0.45 ? '#0a0a0a' : '#ffffff';
  return { background: `rgb(${r}, ${g}, ${b})`, color };
}

const INFINITY_GREEN_BG = '#14532d'; // dark green (green-900)
const INFINITY_RED_BG = '#7f1d1d'; // dark red (red-900)
const SELF_BG = '#fbbf24'; // amber-400 for baseline-vs-self
const COL_BEST_BG = '#bbf7d0'; // green-200 for best per column in main table

/**
 * Build per-config Pareto frontiers from filtered InferenceData. Filters by
 * selected precisions + active legend toggles, then groups by hwKey and runs
 * the shared 2-D Pareto algorithm on (x, y) = (interactivity, selected metric).
 * Direction is taken from the active y-metric's roofline direction.
 */
function useConfigSeries(direction: ParetoDirection): {
  configs: ConfigSeries[];
  yLabel: string;
  yTitle: string;
} {
  const { graphs, activeHwTypes, selectedPrecisions, hardwareConfig, selectedYAxisMetric } =
    useInference();
  return useMemo(() => {
    const interactivityGraph = graphs.find((g) => g.chartDefinition.chartType === 'interactivity');
    if (!interactivityGraph) return { configs: [], yLabel: '', yTitle: '' };

    const chartDef = interactivityGraph.chartDefinition;
    const yLabel =
      (chartDef[`${selectedYAxisMetric}_label` as keyof typeof chartDef] as string) || '';
    const yTitle =
      (chartDef[`${selectedYAxisMetric}_title` as keyof typeof chartDef] as string) || '';

    // Group filtered points by hwKey.
    const byHw = new Map<string, InferenceData[]>();
    for (const d of interactivityGraph.data) {
      const hw = String(d.hwKey);
      if (activeHwTypes.size > 0 && !activeHwTypes.has(hw)) continue;
      if (!selectedPrecisions.includes(d.precision)) continue;
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      const arr = byHw.get(hw) ?? [];
      arr.push(d);
      byHw.set(hw, arr);
    }

    const result: ConfigSeries[] = [];
    for (const [hwKey, points] of byHw) {
      if (points.length < 2) continue;
      const frontier = paretoFrontier(
        points.map((p) => ({ x: p.x, y: p.y })),
        direction,
      );
      if (frontier.length < 2) continue;
      const hwConfig = hardwareConfig[hwKey] ?? getHardwareConfig(hwKey);
      result.push({ hwKey, label: getDisplayLabel(hwConfig), frontier });
    }
    // Order: same as legend (hardwareConfig insertion order, already sorted by
    // model sort index in InferenceContext).
    const order = Object.keys(hardwareConfig);
    result.sort((a, b) => {
      const ai = order.indexOf(a.hwKey);
      const bi = order.indexOf(b.hwKey);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
    return { configs: result, yLabel, yTitle };
  }, [graphs, activeHwTypes, selectedPrecisions, hardwareConfig, selectedYAxisMetric, direction]);
}

interface BaselineSelectProps {
  value: string;
  onChange: (next: string) => void;
  configs: ConfigSeries[];
  label: string;
  testId?: string;
}

function BaselineSelect({ value, onChange, configs, label, testId }: BaselineSelectProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[14rem] text-sm" data-testid={testId}>
          <SelectValue placeholder="Select baseline" />
        </SelectTrigger>
        <SelectContent>
          {configs.map((c) => (
            <SelectItem key={c.hwKey} value={c.hwKey}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InfoIcon({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Info"
          >
            <HelpCircle className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

/** Per-interactivity value table + linked ratio heatmap. */
function ValueAndDiffTable({
  configs,
  direction,
  yLabel,
  yTitle,
}: {
  configs: ConfigSeries[];
  direction: ParetoDirection;
  yLabel: string;
  yTitle: string;
}) {
  const higherBetter = direction === 'higher';
  // Compute buckets: every 10 from 10 up through floor(globalMax / 10) * 10.
  const buckets = useMemo(() => {
    let globalMax = 0;
    for (const c of configs) {
      const maxX = c.frontier.at(-1)?.x ?? 0;
      if (maxX > globalMax) globalMax = maxX;
    }
    const hi = Math.floor(globalMax / 10) * 10;
    const out: number[] = [];
    for (let v = 10; v <= hi; v += 10) out.push(v);
    return out;
  }, [configs]);

  // Per-(config, bucket) value cell, with the column-best highlight.
  const valueCells = useMemo(() => {
    const grid: (number | null)[][] = configs.map((c) =>
      buckets.map((b) => interpAlongFrontier(c.frontier, b, direction)),
    );
    const colBestRow: (number | null)[] = buckets.map((_, ci) => {
      let best: number | null = null;
      for (const row of grid) {
        const v = row[ci];
        if (v === null) continue;
        if (best === null) {
          best = v;
          continue;
        }
        if (higherBetter ? v > best : v < best) best = v;
      }
      return best;
    });
    return { grid, colBestRow };
  }, [configs, buckets, direction, higherBetter]);

  // Baseline selection for the ratio sub-table.
  const enabledKeys = configs.map((c) => c.hwKey);
  const defaultBaseline =
    pickDefaultBaseline(enabledKeys, DEFAULT_THROUGHPUT_BASELINE_HINTS) ?? enabledKeys[0] ?? '';
  const [baselineKey, setBaselineKey] = useState<string>(defaultBaseline);
  // If the previously-picked baseline isn't enabled anymore, snap to the default.
  const effectiveBaseline = enabledKeys.includes(baselineKey) ? baselineKey : defaultBaseline;
  const baselineRow = useMemo(() => {
    const idx = configs.findIndex((c) => c.hwKey === effectiveBaseline);
    if (idx === -1) return null;
    return valueCells.grid[idx];
  }, [configs, valueCells, effectiveBaseline]);

  const directionHint = higherBetter ? 'Higher is better.' : 'Lower is better.';
  const valueTooltip =
    `For each enabled config we compute the Pareto frontier of ${yTitle || 'the selected metric'} vs interactivity, ` +
    `then read off the value at every 10 tok/s/user step. Em-dash means that interactivity is outside the config's reachable range. ` +
    `Best value per column is highlighted in green. ${directionHint}`;

  const ratioTooltip = higherBetter
    ? 'other / baseline at each bucket, rendered as Nx. "∞" means the baseline cannot reach that interactivity but the other config can (green = good for other); "0×" the reverse (red); "—" means neither can. Color scale is centered at 1.00× and log-symmetric, saturating at 3.00× (green) and 0.33× (red).'
    : 'other / baseline at each bucket, rendered as Nx. Since lower is better, color is INVERTED: ratios < 1 are green (other uses less than baseline = good) and ratios > 1 are red. "∞" means the baseline cannot reach that interactivity but the other config can — colored red (other is way worse / infinite cost relative to baseline); "0×" the reverse — colored green (other achieves zero relative to baseline = great); "—" means neither can. Saturation caps at 3.00× and 0.33×.';

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Per-GPU value at each interactivity bucket</h2>
          <InfoIcon text={valueTooltip} />
        </div>
      </div>
      <p className="text-muted-foreground text-sm mt-1 mb-4">
        Linearly interpolated {yLabel || 'metric value'} along each config&apos;s Pareto frontier.
        Reactive to model, precision, sequence and the legend on/off toggles above. {directionHint}
      </p>

      {configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Enable at least one configuration in the legend to populate the tables.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card text-left font-medium px-2 py-1.5 border-b border-border whitespace-nowrap">
                  Config
                </th>
                {buckets.map((b) => (
                  <th
                    key={b}
                    className="text-right font-medium px-2 py-1.5 border-b border-border tabular-nums"
                  >
                    {b}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-card text-left text-muted-foreground font-normal px-2 py-1 border-b border-border whitespace-nowrap">
                  Interactivity (tok/s/user) →
                </th>
                <th
                  className="text-right text-muted-foreground font-normal px-2 py-1 border-b border-border"
                  colSpan={buckets.length}
                />
              </tr>
            </thead>
            <tbody>
              {configs.map((c, ri) => (
                <tr key={c.hwKey} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 bg-card text-left font-medium px-2 py-1.5 whitespace-nowrap">
                    {c.label}
                  </td>
                  {buckets.map((b, ci) => {
                    const v = valueCells.grid[ri][ci];
                    if (v === null) {
                      return (
                        <td
                          key={b}
                          className="text-right px-2 py-1.5 tabular-nums text-muted-foreground"
                        >
                          —
                        </td>
                      );
                    }
                    const isBest = valueCells.colBestRow[ci] === v;
                    return (
                      <td
                        key={b}
                        className={cn('text-right px-2 py-1.5 tabular-nums', isBest && 'font-bold')}
                        style={
                          isBest ? { backgroundColor: COL_BEST_BG, color: '#0a0a0a' } : undefined
                        }
                      >
                        {formatValue(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {configs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Ratio vs baseline</h3>
              <InfoIcon text={ratioTooltip} />
            </div>
            <BaselineSelect
              label="Baseline"
              configs={configs}
              value={effectiveBaseline}
              onChange={(v) => {
                setBaselineKey(v);
                track('inference_throughput_baseline_changed', { baseline: v });
              }}
              testId="throughput-baseline-select"
            />
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left font-medium px-2 py-1.5 border-b border-border whitespace-nowrap">
                    Config
                  </th>
                  {buckets.map((b) => (
                    <th
                      key={b}
                      className="text-right font-medium px-2 py-1.5 border-b border-border tabular-nums"
                    >
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.map((c, ri) => (
                  <tr key={c.hwKey} className="border-b border-border last:border-b-0">
                    <td className="sticky left-0 z-10 bg-card text-left font-medium px-2 py-1.5 whitespace-nowrap">
                      {c.label}
                    </td>
                    {buckets.map((b, ci) => {
                      const other = valueCells.grid[ri][ci];
                      const baseline = baselineRow ? baselineRow[ci] : null;
                      const isSelf = c.hwKey === effectiveBaseline;

                      if (isSelf) {
                        return (
                          <td
                            key={b}
                            className="text-right px-2 py-1.5 tabular-nums"
                            style={{ backgroundColor: SELF_BG, color: '#0a0a0a' }}
                          >
                            1.00×
                          </td>
                        );
                      }

                      if (other === null && baseline === null) {
                        return (
                          <td
                            key={b}
                            className="text-right px-2 py-1.5 tabular-nums text-muted-foreground"
                          >
                            —
                          </td>
                        );
                      }
                      // Baseline can't reach, other can:
                      //   - higher-better: "infinite multiplier of throughput" → great for other → green
                      //   - lower-better: "infinite multiplier of cost" → bad for other → red
                      if (other !== null && baseline === null) {
                        const bg = higherBetter ? INFINITY_GREEN_BG : INFINITY_RED_BG;
                        return (
                          <td
                            key={b}
                            className="text-right px-2 py-1.5 tabular-nums font-semibold"
                            style={{ backgroundColor: bg, color: '#ffffff' }}
                          >
                            ∞
                          </td>
                        );
                      }
                      // Other can't reach, baseline can:
                      //   - higher-better: other is 0× → bad for other → red
                      //   - lower-better: other is 0× cost → great for other → green
                      if (other === null && baseline !== null) {
                        const bg = higherBetter ? INFINITY_RED_BG : INFINITY_GREEN_BG;
                        return (
                          <td
                            key={b}
                            className="text-right px-2 py-1.5 tabular-nums font-semibold"
                            style={{ backgroundColor: bg, color: '#ffffff' }}
                          >
                            0×
                          </td>
                        );
                      }
                      const ratio = other! / baseline!;
                      const { background, color } = ratioColor(ratio, direction);
                      return (
                        <td
                          key={b}
                          className="text-right px-2 py-1.5 tabular-nums"
                          style={{ backgroundColor: background, color }}
                        >
                          {ratio.toFixed(2)}×
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

/** AUC summary table with three baseline columns. */
function AucSummaryTable({
  configs,
  direction,
  yLabel,
}: {
  configs: ConfigSeries[];
  direction: ParetoDirection;
  yLabel: string;
}) {
  const higherBetter = direction === 'higher';
  const hi = useMemo(() => {
    let globalMax = 0;
    for (const c of configs) {
      const maxX = c.frontier.at(-1)?.x ?? 0;
      if (maxX > globalMax) globalMax = maxX;
    }
    return Math.floor(globalMax / 10) * 10;
  }, [configs]);

  const aucs = useMemo(
    () => configs.map((c) => aucUnderFrontier(c.frontier, 10, hi, direction)),
    [configs, hi, direction],
  );

  // Per-config integration window — for lower-is-better this may shrink to
  // the reachable x-range; for higher-is-better it's always [10, hi].
  const aucWindows = useMemo(
    () => configs.map((c) => aucWindow(c.frontier, 10, hi, direction)),
    [configs, hi, direction],
  );

  const enabledKeys = configs.map((c) => c.hwKey);
  const defaultPrimary =
    pickDefaultBaseline(enabledKeys, DEFAULT_AUC_PRIMARY_HINTS) ?? enabledKeys[0] ?? '';
  const defaultSecondary =
    pickDefaultBaseline(enabledKeys, DEFAULT_AUC_SECONDARY_HINTS) ?? enabledKeys[0] ?? '';
  const defaultTertiary =
    pickDefaultBaseline(enabledKeys, DEFAULT_AUC_TERTIARY_HINTS, false) ?? enabledKeys[0] ?? '';

  const [primary, setPrimary] = useState<string>(defaultPrimary);
  const [secondary, setSecondary] = useState<string>(defaultSecondary);
  const [tertiary, setTertiary] = useState<string>(defaultTertiary);

  const eff = (s: string, d: string) => (enabledKeys.includes(s) ? s : d);
  const ePrimary = eff(primary, defaultPrimary);
  const eSecondary = eff(secondary, defaultSecondary);
  const eTertiary = eff(tertiary, defaultTertiary);

  const baselineAuc = (key: string): number | null => {
    const i = configs.findIndex((c) => c.hwKey === key);
    return i === -1 ? null : aucs[i];
  };

  const primaryAuc = baselineAuc(ePrimary);
  const secondaryAuc = baselineAuc(eSecondary);
  const tertiaryAuc = baselineAuc(eTertiary);

  const ratioCell = (auc: number, baseline: number | null, baselineKey: string, hwKey: string) => {
    if (baseline === null || baseline === 0) return { text: '—', style: undefined };
    const ratio = auc / baseline;
    if (hwKey === baselineKey) {
      return {
        text: '1.00×',
        style: { backgroundColor: SELF_BG, color: '#0a0a0a' },
      };
    }
    const { background, color } = ratioColor(ratio, direction);
    return {
      text: `${ratio.toFixed(2)}×`,
      style: { backgroundColor: background, color },
    };
  };

  const directionHint = higherBetter
    ? 'Higher is better — a config that reaches both high interactivity AND high throughput-like value scores best.'
    : 'Lower is better — a config that achieves low cost / energy across the reachable interactivity range scores best.';

  const outOfRangeHint = higherBetter
    ? "Outside a config's reachable interactivity range the integrand is treated as 0 (worst case for higher-is-better)."
    : "Integration is restricted to each config's reachable interactivity range. The per-row window is shown below the AUC.";

  const aucTooltip =
    `Trapezoidal area under each config's ${yLabel || 'selected metric'} vs interactivity Pareto frontier, integrated from 10 to ${hi} tok/s/user. ` +
    `${outOfRangeHint} ${directionHint}`;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Area under Pareto frontier (AUC summary)</h2>
        <InfoIcon text={aucTooltip} />
      </div>
      <p className="text-muted-foreground text-sm mt-1 mb-4">
        Integration window: 10 → {hi} tok/s/user. {directionHint}
      </p>

      {configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Enable at least one configuration in the legend to populate the AUC summary.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
            <BaselineSelect
              label="Primary baseline"
              configs={configs}
              value={ePrimary}
              onChange={(v) => {
                setPrimary(v);
                track('inference_auc_primary_baseline_changed', { baseline: v });
              }}
              testId="auc-primary-baseline-select"
            />
            <BaselineSelect
              label="Secondary baseline"
              configs={configs}
              value={eSecondary}
              onChange={(v) => {
                setSecondary(v);
                track('inference_auc_secondary_baseline_changed', { baseline: v });
              }}
              testId="auc-secondary-baseline-select"
            />
            <BaselineSelect
              label="Tertiary baseline"
              configs={configs}
              value={eTertiary}
              onChange={(v) => {
                setTertiary(v);
                track('inference_auc_tertiary_baseline_changed', { baseline: v });
              }}
              testId="auc-tertiary-baseline-select"
            />
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium px-2 py-1.5 whitespace-nowrap">Config</th>
                  <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap">AUC</th>
                  {!higherBetter && (
                    <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap">Window</th>
                  )}
                  <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap">
                    Ratio vs primary
                  </th>
                  <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap">
                    Ratio vs secondary
                  </th>
                  <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap">
                    Ratio vs tertiary
                  </th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c, i) => {
                  const auc = aucs[i];
                  const win = aucWindows[i];
                  const primaryR = ratioCell(auc, primaryAuc, ePrimary, c.hwKey);
                  const secondaryR = ratioCell(auc, secondaryAuc, eSecondary, c.hwKey);
                  const tertiaryR = ratioCell(auc, tertiaryAuc, eTertiary, c.hwKey);
                  return (
                    <tr key={c.hwKey} className="border-b border-border last:border-b-0">
                      <td className="text-left font-medium px-2 py-1.5 whitespace-nowrap">
                        {c.label}
                      </td>
                      <td className="text-right tabular-nums px-2 py-1.5">{formatValue(auc)}</td>
                      {!higherBetter && (
                        <td className="text-right tabular-nums px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                          {win ? `${win.lo}→${win.hi}` : '—'}
                        </td>
                      )}
                      <td className="text-right tabular-nums px-2 py-1.5" style={primaryR.style}>
                        {primaryR.text}
                      </td>
                      <td className="text-right tabular-nums px-2 py-1.5" style={secondaryR.style}>
                        {secondaryR.text}
                      </td>
                      <td className="text-right tabular-nums px-2 py-1.5" style={tertiaryR.style}>
                        {tertiaryR.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Section that renders the two summary tables below the Pareto chart on the
 * inference page. Renders for all y-axis metrics; the "is higher better"
 * direction is taken from the active metric's roofline direction on the
 * interactivity chart definition.
 */
export default function InteractivityTables() {
  const { selectedYAxisMetric, graphs } = useInference();

  const interactivityGraph = graphs.find((g) => g.chartDefinition.chartType === 'interactivity');
  const direction: ParetoDirection = interactivityGraph
    ? getMetricParetoDirection(interactivityGraph.chartDefinition, selectedYAxisMetric)
    : 'higher';

  const { configs, yLabel, yTitle } = useConfigSeries(direction);

  if (!interactivityGraph) return null;

  return (
    <>
      <ValueAndDiffTable configs={configs} direction={direction} yLabel={yLabel} yTitle={yTitle} />
      <AucSummaryTable configs={configs} direction={direction} yLabel={yLabel} />
    </>
  );
}
