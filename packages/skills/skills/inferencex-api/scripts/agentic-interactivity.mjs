/**
 * AgentX slow-tail interactivity, matching rowToAggDataEntry in the dashboard.
 * Raw API latency fields are seconds. Do not use this for single-turn workloads.
 */
export function agenticP90Interactivity(metrics) {
  const hasFullResponse = ['mean', 'median', 'p75', 'p90', 'p95', 'p99', 'p99.9'].some(
    (percentile) => typeof metrics?.[`${percentile}_full_response_itl`] === 'number',
  );
  const sourceMetric = hasFullResponse ? 'p90_full_response_itl' : 'p90_itl';
  const latency = metrics?.[sourceMetric];
  if (typeof latency !== 'number' || !Number.isFinite(latency) || latency <= 0) return null;
  const value = 1 / latency;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, sourceMetric, statistic: 'p90', unit: 'tok/s/user' };
}
