import type { CostType, InterpolatedResult } from './types';

/** Get the tok/s/MW value for the selected token type. */
export function getTpPerMwForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTpPerMw;
  if (costType === 'output') return d.outputTpPerMw;
  return d.tpPerMw; // total
}

/**
 * The same figure on a per-total-chip basis, so configs can be ranked against
 * each other.
 *
 * `inputTpPerMw` and `outputTpPerMw` are derived from `input_tput_per_gpu` and
 * `output_tput_per_gpu`, which a disaggregated run reports per *prefill* and per
 * *decode* chip. Divided by fewer chips, they read high — which is exactly the
 * caveat the throughput charts carry ("not an apples-to-apples comparison"). That
 * is fine for a bar chart the reader is told to interpret, and not fine for a
 * ranking that silently picks a winner: measured against production history, a
 * raw output ranking hands 5 of 46 chip-winners to a disaggregated config that a
 * comparable basis rejects, and changes 10 of 46 outright (17 of 46 on input).
 *
 * `tpPerMw` is already per chip overall — the total basis needs no correction and
 * is unchanged by this (46 of 46 winners identical) — so the token-type figures
 * are recovered by splitting it with the same measured share revenue uses. For an
 * aggregated config that is an identity: the rates already sum to the total, so
 * `tpPerMw x share` *is* `inputTpPerMw`.
 *
 * Falls back to the raw figure when no share was recovered, which leaves
 * behaviour exactly as it was rather than ranking on a zero.
 */
export function getComparableTpPerMwForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'total') return d.tpPerMw;
  if (typeof d.inputTokenShare !== 'number' || !Number.isFinite(d.inputTokenShare)) {
    return getTpPerMwForType(d, costType);
  }
  const share = Math.max(0, Math.min(1, d.inputTokenShare));
  return d.tpPerMw * (costType === 'input' ? share : 1 - share);
}
