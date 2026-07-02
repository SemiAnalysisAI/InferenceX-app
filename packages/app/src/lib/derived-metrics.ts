/**
 * Single source of truth for the three derived-metric formulas that turn a
 * benchmark row's raw throughput/power/cost tiers into the numbers the charts,
 * the SSR compare pages, and the CSV export display:
 *
 *   - cost per million tokens        ($/hr ÷ tokens-per-hour-in-millions)
 *   - throughput per megawatt        (tok/s/GPU → tok/s/MW)
 *   - joules per token               (kW → W, ÷ tok/s/GPU)
 *
 * These functions are intentionally pure arithmetic with NO zero/undefined
 * guards baked in. The three historical call sites guard their inputs
 * differently (see note below), and the byte-identical-output constraint means
 * each site must keep its own guard. Centralising only the arithmetic removes
 * the drift risk (energy math had already diverged between chart-utils and
 * compare-ssr) while preserving every site's exact edge-case behaviour.
 *
 * Guard semantics that MUST stay at the call sites (they differ):
 *   - chart-utils `createChartDataPoint`: cost fields use `hardwarePower &&
 *     tokensPerHour ? … : 0` (guards on power being truthy too, not just
 *     throughput); perMw/joule fields use `hardwarePower && tput ? … : 0` and
 *     the input/output variants are omitted entirely when their throughput is 0.
 *   - compare-ssr `computeGpuCost`: `costPerHour && tps > 0 ? … : 0` (guards on
 *     cost being truthy AND tps > 0); perMw uses `power && power > 0 ? … : 0`.
 *   - utils backfills (`computeOutputCostFields`/`computeInputCostFields`/
 *     `computeEnergyFields`): guard on the (possibly fallback-estimated)
 *     tokens-per-hour / throughput being > 0 and round with
 *     `parseFloat(x.toFixed(3))`.
 *   - utils `calculateCostsForGpus`: NO divisor guard at all (a zero throughput
 *     yields Infinity/NaN post-round) — preserved verbatim.
 */

/**
 * Tokens per hour expressed in millions: `(tokPerSec * 3600) / 1_000_000`.
 * This is the denominator shared by every cost-per-million-token variant.
 */
export function tokensPerHourInMillions(tokPerSec: number): number {
  return (tokPerSec * 3600) / 1_000_000;
}

/**
 * Cost per million tokens: `costPerHour / ((tokPerSec * 3600) / 1_000_000)`.
 *
 * Pure division — callers own the zero/undefined guards (they differ; see the
 * module header). With `tokPerSec === 0` this returns `Infinity`/`NaN`, which is
 * exactly what the unguarded `calculateCostsForGpus` path historically produced.
 */
export function costPerMillionTokens(costPerHour: number, tokPerSec: number): number {
  return costPerHour / tokensPerHourInMillions(tokPerSec);
}

/**
 * Throughput per megawatt from per-GPU throughput and per-GPU power (kW):
 * `(tputPerGpu * 1000) / powerKw`. Result is tok/s/MW.
 *
 * Pure division — callers own the zero/undefined guards. With `powerKw === 0`
 * this returns `Infinity`/`NaN`.
 */
export function tokensPerMwFromPerGpu(tputPerGpu: number, powerKw: number): number {
  return (tputPerGpu * 1000) / powerKw;
}

/**
 * All-in provisioned Joules per token: `J/token = W/GPU / (tok/s/gpu)`.
 * `powerKw` is per-GPU power in kW, so it is converted to watts (×1000). Since
 * Watt = Joule/second, `W / (tok/s) = J/tok`.
 *
 * Pure division — callers own the zero/undefined guards. With `tputPerGpu === 0`
 * this returns `Infinity`/`NaN`.
 */
export function joulesPerToken(powerKw: number, tputPerGpu: number): number {
  return (powerKw * 1000) / tputPerGpu;
}
