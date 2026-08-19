export interface P50InteractivityMetrics {
  median_tpot?: number;
  median_tpot_intvty?: number;
  median_intvty?: number;
}

/**
 * Ordinary decode P50 interactivity, expressed as the reciprocal of median
 * time per output token. AgentX's canonical chart interactivity may use
 * full-response ITL instead, so consumers that promise P50 TPOT semantics
 * must not read `median_intvty` first.
 */
export function p50Interactivity(metrics: P50InteractivityMetrics): number {
  const directP50 = metrics.median_tpot_intvty;
  if (typeof directP50 === 'number' && Number.isFinite(directP50) && directP50 > 0) {
    return directP50;
  }
  const medianTpot = metrics.median_tpot;
  if (typeof medianTpot === 'number' && Number.isFinite(medianTpot) && medianTpot > 0) {
    return 1 / medianTpot;
  }
  const fallback = metrics.median_intvty;
  return typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}
