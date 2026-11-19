export function fmtThroughput(value: number): string {
  return value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
}

export function fmtCostPerMtok(value: number): string {
  return `$${value >= 0.1 ? value.toFixed(2) : value.toFixed(3)}`;
}

export function fmtGpuHour(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function pctFaster(winner: number, runnerUp: number): number {
  return Math.round((winner / runnerUp - 1) * 100);
}

export function pctCheaper(winner: number, runnerUp: number): number {
  return Math.round((1 - winner / runnerUp) * 100);
}

export function fmtMs(value: number): string {
  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(1)} ms`;
}
