import type { ComparisonModel } from '../compare/model';

/** Bins per doubling of the size axis. */
const BINS_PER_OCTAVE = 2;

/** Size bin of a token count (GEMM M, MoE tokens): half-octaves. */
export function sizeBin(tokens: number): number {
  return Math.round(Math.log2(tokens) * BINS_PER_OCTAVE);
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
