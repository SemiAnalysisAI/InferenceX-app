import type { ScaleConfig } from '@/lib/d3-chart/D3Chart';

export function valueScale(log: boolean, values: number[]): ScaleConfig {
  const pos = values.filter((v) => v > 0);
  const hi = pos.length > 0 ? Math.max(...pos) : 1;
  if (log && pos.length > 0) {
    const lo = Math.min(...pos);
    return {
      type: 'log',
      domain: lo === hi ? [lo / 2, hi * 2] : [lo / 1.1, hi * 1.1],
      nice: false,
    };
  }
  return { type: 'linear', domain: [0, hi * 1.05], nice: true };
}

export function ratioScale(values: number[]): ScaleConfig {
  const pos = values.filter((v) => v > 0);
  return {
    type: 'log',
    domain: [Math.min(1, ...pos) / 1.5, Math.max(1, ...pos) * 1.3],
    nice: false,
  };
}

export const formatRatio = (v: number) => `${v >= 10 ? v.toFixed(0) : v.toFixed(2)}×`;

export function formatCompact(v: number): string {
  if (v >= 1e6) return `${Number((v / 1e6).toPrecision(3))}M`;
  if (v >= 1e3) return `${Number((v / 1e3).toPrecision(3))}k`;
  return `${Number(v.toPrecision(3))}`;
}

export function logTicks(domain: number[]): number[] {
  const lo = Math.min(...domain);
  const hi = Math.max(...domain);
  const decades = Math.log10(hi / lo);
  const steps = decades > 4 ? [1] : decades > 1.2 ? [1, 2, 5] : [1, 1.5, 2, 3, 5, 7];
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const s of steps) {
      const v = s * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  return out;
}

export function ticksFor(scale: ScaleConfig): { tickValues?: number[] } {
  return scale.type === 'log' ? { tickValues: logTicks(scale.domain) } : {};
}
