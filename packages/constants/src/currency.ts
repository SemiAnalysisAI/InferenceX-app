/**
 * Pinned FX rate for the tokens-per-currency chart metrics.
 *
 * Every cost in `HW_REGISTRY` (`costh`, `costn`, `costr`) is $/GPU/hr from the
 * SemiAnalysis AI Cloud TCO Model, so the ¥ metrics are the $ metrics divided
 * by this rate.
 *
 * Deliberately a constant rather than a live feed: these charts compare
 * hardware, and a floating rate would make a chip's plotted ¥ value move on
 * days when nothing about the chip or the benchmark changed. Two runs of the
 * same recipe a week apart must land on the same point. Refresh it on a normal
 * cadence with the TCO figures it sits beside, and note the date here.
 *
 * Source: 1 USD = 6.7240 CNY on 2026-08-20, rounded to 6.72.
 * https://www.exchange-rates.org/exchange-rate-history/usd-cny-2026
 */
export const USD_TO_CNY = 6.72;

/** Date the rate above was last checked, surfaced in the chart disclaimer. */
export const USD_TO_CNY_AS_OF = '2026-08-20';
