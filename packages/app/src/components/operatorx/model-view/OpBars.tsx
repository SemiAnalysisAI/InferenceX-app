import type { ComparisonModel } from '../compare/model';

/** Bins per doubling of the size axis. */
const BINS_PER_OCTAVE = 2;

/** Unrounded size bin of a token count, for placing ticks on a token axis. */
export const tokenBin = (tokens: number) => Math.log2(tokens) * BINS_PER_OCTAVE;

/** Size bin of a token count (GEMM M, MoE tokens): half-octaves. */
export function sizeBin(tokens: number): number {
  return Math.round(tokenBin(tokens));
}

/** Representative token count of a bin. */
export function binTokens(bin: number): number {
  return Math.round(2 ** (bin / BINS_PER_OCTAVE));
}

/** The indices whose size falls in `bin`. */
export function inBin(model: ComparisonModel, indices: number[], bin: number): number[] {
  return indices.filter((i) => {
    const x = model.view.cases[i].x;
    return x !== null && x > 0 && sizeBin(x) === bin;
  });
}

const median = (values: number[]) => {
  const v = values.toSorted((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export interface GpuValue {
  hardware: string;
  /** Median over the cases, among those the GPU measured. */
  value: number;
  measured: number;
}

/** Each selected GPU's median metric over some cases. */
export function gpuValues(model: ComparisonModel, indices: number[]): GpuValue[] {
  return model.hardware.flatMap((hw) => {
    const values = indices.flatMap((i) => {
      const v = model.value(hw, i);
      return v === null ? [] : [v];
    });
    return values.length > 0
      ? [{ hardware: hw, value: median(values), measured: values.length }]
      : [];
  });
}

const LANE_PX = 7;
const GAP_PX = 3;
const PAD_PX = 8;

/** Height of the bars for this many GPUs. */
export const barsHeight = (lanes: number) => lanes * LANE_PX + (lanes - 1) * GAP_PX + PAD_PX;

/**
 * One lane per selected GPU, scaled to the row's largest value, each labeled. The height
 * depends only on the GPUs, never on which ones have data at this size, so rows keep
 * their place as the size changes; a GPU without a value leaves its lane empty, and
 * `empty` is shown when none has one.
 */
export function OpBars({
  model,
  values,
  empty,
}: {
  model: ComparisonModel;
  values: GpuValue[];
  empty: string;
}) {
  const lanes = model.hardware.length;
  const byHardware = new Map(values.map((v) => [v.hardware, v]));
  const max = Math.max(...values.map((v) => v.value));
  return (
    <div
      className="relative flex flex-col justify-center gap-[3px]"
      style={{ height: barsHeight(lanes) }}
    >
      {values.length === 0 ? (
        <span className="text-xs text-muted-foreground">{empty}</span>
      ) : (
        model.hardware.map((hw) => {
          const v = byHardware.get(hw);
          return (
            <div key={hw} className="flex h-[7px] items-center gap-2">
              {v && (
                <>
                  <div
                    className="h-full rounded-r-sm"
                    style={{ width: `${(v.value / max) * 85}%`, background: model.colors[hw] }}
                  />
                  <span className="shrink-0 text-2xs leading-none text-muted-foreground tabular-nums">
                    {model.metric.format(v.value)}
                  </span>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export interface GpuSweep {
  hardware: string;
  /** Median over the cases in each size bin the GPU measured, by bin. */
  points: { bin: number; value: number }[];
}

/** Each selected GPU's median metric in every size bin it has a positive value in. */
export function gpuSweep(model: ComparisonModel, indices: number[]): GpuSweep[] {
  return model.hardware.flatMap((hw) => {
    const byBin = new Map<number, number[]>();
    for (const i of indices) {
      const x = model.view.cases[i].x;
      const v = model.value(hw, i);
      if (x === null || x <= 0 || v === null || v <= 0) continue;
      const bin = sizeBin(x);
      const values = byBin.get(bin);
      if (values) values.push(v);
      else byBin.set(bin, [v]);
    }
    const points = [...byBin]
      .map(([bin, values]) => ({ bin, value: median(values) }))
      .sort((a, b) => a.bin - b.bin);
    return points.length > 0 ? [{ hardware: hw, points }] : [];
  });
}

/** Height of a row of line charts. */
export const SWEEP_PX = 64;
const SWEEP_PAD_PX = 5;

/** Where a size bin sits across `[first, last]`, as a percentage of the width. */
export const binPct = (bin: number, [first, last]: [number, number]) =>
  last === first ? 50 : ((bin - first) / (last - first)) * 100;

/**
 * One line per selected GPU over every size bin from `range[0]` to `range[1]` (log tokens
 * across, log metric up, scaled to the row), with the row's largest and smallest values
 * beside it. The x positions match the shared token axis, so rows read against each other.
 */
export function OpSweep({
  model,
  series,
  range,
  empty,
}: {
  model: ComparisonModel;
  series: GpuSweep[];
  range: [number, number];
  empty: string;
}) {
  if (series.length === 0)
    return (
      <div className="flex items-center" style={{ height: SWEEP_PX }}>
        <span className="text-xs text-muted-foreground">{empty}</span>
      </div>
    );
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const [min, max] = [Math.min(...values), Math.max(...values)];
  // one value across the row sits mid-height
  const [lo, hi] = min === max ? [min / 2, max * 2] : [min, max];
  const y = (v: number) =>
    SWEEP_PAD_PX +
    (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) *
      (SWEEP_PX - 2 * SWEEP_PAD_PX);
  return (
    <div className="flex gap-2" style={{ height: SWEEP_PX }}>
      <div className="relative min-w-0 flex-1 border-b border-l border-border/60">
        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 100 ${SWEEP_PX}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {series.map((s) =>
            s.points.length > 1 ? (
              <polyline
                key={s.hardware}
                points={s.points.map((p) => `${binPct(p.bin, range)},${y(p.value)}`).join(' ')}
                fill="none"
                stroke={model.colors[s.hardware]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </svg>
        {/* a GPU with one size has no line; a dot marks it (circles would stretch with the svg) */}
        {series.map((s) =>
          s.points.length === 1 ? (
            <span
              key={s.hardware}
              className="absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${binPct(s.points[0].bin, range)}%`,
                top: y(s.points[0].value),
                background: model.colors[s.hardware],
              }}
            />
          ) : null,
        )}
      </div>
      <div className="flex w-16 shrink-0 flex-col justify-between text-2xs leading-none whitespace-nowrap text-muted-foreground tabular-nums">
        <span>{model.metric.format(max)}</span>
        <span>{model.metric.format(min)}</span>
      </div>
    </div>
  );
}
