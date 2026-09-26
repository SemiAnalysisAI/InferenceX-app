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

/** One bar per GPU, scaled to the row's largest value, each labeled. */
export function OpBars({ model, values }: { model: ComparisonModel; values: GpuValue[] }) {
  const max = Math.max(...values.map((v) => v.value));
  return (
    <div className="flex h-16 flex-col justify-center gap-[3px] py-1">
      {values.map((v) => (
        <div key={v.hardware} className="flex h-[7px] items-center gap-2">
          <div
            className="h-full rounded-r-sm"
            style={{ width: `${(v.value / max) * 85}%`, background: model.colors[v.hardware] }}
          />
          <span className="shrink-0 text-2xs leading-none text-muted-foreground tabular-nums">
            {model.metric.format(v.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
