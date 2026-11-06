import type { BenchmarkRow } from '@/lib/api/api';

export type TokenMetricType = 'total' | 'input' | 'output';

const OUTPUT_ONLY: readonly TokenMetricType[] = ['output'];

// A source that publishes only output throughput stores output_tput_per_gpu without tput_per_gpu.
export function supportedTokenMetrics(
  row: Pick<BenchmarkRow, 'metrics'>,
): readonly TokenMetricType[] | undefined {
  const { tput_per_gpu: total, output_tput_per_gpu: output } = row.metrics;
  return (total === undefined || total === null) && output !== undefined && output !== null
    ? OUTPUT_ONLY
    : undefined;
}

export function supportsTokenMetric(
  row: Pick<BenchmarkRow, 'metrics'>,
  tokenType: TokenMetricType,
): boolean {
  return supportedTokenMetrics(row)?.includes(tokenType) ?? true;
}
