import type { TrendDataPoint, TrendSource } from '@/components/inference/types';

export class MeasuredTrendPoint implements TrendDataPoint {
  date: string;
  value: number;
  x: number;
  sources: readonly TrendSource[];
  waterfallEligible: boolean;

  constructor(
    date: string,
    value: number,
    x: number,
    sources: readonly TrendSource[],
    waterfallEligible: boolean,
  ) {
    this.date = date;
    this.value = value;
    this.x = x;
    this.sources = sources;
    this.waterfallEligible = waterfallEligible;
  }
}
