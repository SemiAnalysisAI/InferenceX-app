/**
 * Mergeable, bounded-size histogram for positive integer token lengths.
 *
 * Each power-of-two interval is split into 256 linear buckets. This keeps the
 * relative bucket width below 0.4% while bounding a full 1..2^31 distribution
 * to fewer than 8,000 counters. Sketches can be merged by adding aligned
 * counters, which lets the dashboard pool request distributions across an
 * arbitrary set of benchmark points without reading their request timelines.
 */

export const TOKEN_LENGTH_SKETCH_VERSION = 1;
export const TOKEN_LENGTH_BINS_PER_OCTAVE = 256;

export interface TokenLengthSketch {
  version: number;
  binsPerOctave: number;
  /** Number of finite, non-negative samples represented by this sketch. */
  n: number;
  /** Zero-length samples are kept outside the logarithmic bins. */
  zeroCount: number;
  /** Global index represented by counts[0]. */
  minBin: number;
  /** Dense counts from minBin through minBin + counts.length - 1. */
  counts: number[];
}

export interface TokenLengthPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  n: number;
}

function binIndex(value: number, binsPerOctave: number): number {
  const exponent = Math.floor(Math.log2(value));
  const base = 2 ** exponent;
  const subBin = Math.min(binsPerOctave - 1, Math.floor(((value - base) / base) * binsPerOctave));
  return exponent * binsPerOctave + subBin;
}

function binValue(index: number, binsPerOctave: number): number {
  const exponent = Math.floor(index / binsPerOctave);
  const subBin = index - exponent * binsPerOctave;
  const base = 2 ** exponent;
  const lower = base * (1 + subBin / binsPerOctave);
  const upper = base * (1 + (subBin + 1) / binsPerOctave);

  // Token lengths are integers. When a bucket spans integers, use the middle
  // integer rather than a fractional geometric representative.
  const firstInteger = Math.ceil(lower);
  const lastInteger = Math.ceil(upper) - 1;
  if (firstInteger <= lastInteger) return (firstInteger + lastInteger) / 2;
  return (lower + upper) / 2;
}

export function buildTokenLengthSketch(samples: readonly number[]): TokenLengthSketch | null {
  const countsByBin = new Map<number, number>();
  let zeroCount = 0;
  let n = 0;
  for (const raw of samples) {
    if (!Number.isFinite(raw) || raw < 0) continue;
    const value = Math.round(raw);
    n += 1;
    if (value === 0) {
      zeroCount += 1;
      continue;
    }
    const index = binIndex(value, TOKEN_LENGTH_BINS_PER_OCTAVE);
    countsByBin.set(index, (countsByBin.get(index) ?? 0) + 1);
  }
  if (n === 0) return null;

  const indices = [...countsByBin.keys()];
  const minBin = indices.length > 0 ? Math.min(...indices) : 0;
  const maxBin = indices.length > 0 ? Math.max(...indices) : minBin - 1;
  const counts = Array.from({ length: Math.max(0, maxBin - minBin + 1) }, () => 0);
  for (const [index, count] of countsByBin) counts[index - minBin] = count;

  return {
    version: TOKEN_LENGTH_SKETCH_VERSION,
    binsPerOctave: TOKEN_LENGTH_BINS_PER_OCTAVE,
    n,
    zeroCount,
    minBin,
    counts,
  };
}

function isCompatibleSketch(
  sketch: TokenLengthSketch | null | undefined,
): sketch is TokenLengthSketch {
  return Boolean(
    sketch &&
    sketch.version === TOKEN_LENGTH_SKETCH_VERSION &&
    sketch.binsPerOctave === TOKEN_LENGTH_BINS_PER_OCTAVE &&
    Number.isFinite(sketch.n) &&
    sketch.n >= 0 &&
    Array.isArray(sketch.counts),
  );
}

export function mergeTokenLengthSketches(
  sketches: readonly (TokenLengthSketch | null | undefined)[],
): TokenLengthSketch | null {
  const valid = sketches.filter(isCompatibleSketch);
  if (valid.length === 0) return null;

  const withBins = valid.filter((sketch) => sketch.counts.length > 0);
  const minBin = withBins.length > 0 ? Math.min(...withBins.map((sketch) => sketch.minBin)) : 0;
  const maxBin =
    withBins.length > 0
      ? Math.max(...withBins.map((sketch) => sketch.minBin + sketch.counts.length - 1))
      : minBin - 1;
  const counts = Array.from({ length: Math.max(0, maxBin - minBin + 1) }, () => 0);

  let n = 0;
  let zeroCount = 0;
  for (const sketch of valid) {
    n += sketch.n;
    zeroCount += sketch.zeroCount;
    for (let i = 0; i < sketch.counts.length; i += 1) {
      counts[sketch.minBin + i - minBin] += sketch.counts[i] ?? 0;
    }
  }
  if (n === 0) return null;

  return {
    version: TOKEN_LENGTH_SKETCH_VERSION,
    binsPerOctave: TOKEN_LENGTH_BINS_PER_OCTAVE,
    n,
    zeroCount,
    minBin,
    counts,
  };
}

function valueAtRank(sketch: TokenLengthSketch, rank: number): number {
  if (rank < sketch.zeroCount) return 0;
  let cumulative = sketch.zeroCount;
  for (let i = 0; i < sketch.counts.length; i += 1) {
    cumulative += sketch.counts[i] ?? 0;
    if (rank < cumulative) return binValue(sketch.minBin + i, sketch.binsPerOctave);
  }
  return binValue(sketch.minBin + sketch.counts.length - 1, sketch.binsPerOctave);
}

function quantile(sketch: TokenLengthSketch, q: number): number {
  if (sketch.n === 1) return valueAtRank(sketch, 0);
  const position = (sketch.n - 1) * q;
  const lowerRank = Math.floor(position);
  const upperRank = Math.ceil(position);
  const lower = valueAtRank(sketch, lowerRank);
  const upper = valueAtRank(sketch, upperRank);
  return lower + (upper - lower) * (position - lowerRank);
}

export function tokenLengthPercentiles(
  sketch: TokenLengthSketch | null | undefined,
): TokenLengthPercentiles | null {
  if (!isCompatibleSketch(sketch) || sketch.n <= 0) return null;
  return {
    p50: quantile(sketch, 0.5),
    p75: quantile(sketch, 0.75),
    p90: quantile(sketch, 0.9),
    p95: quantile(sketch, 0.95),
    p99: quantile(sketch, 0.99),
    n: sketch.n,
  };
}
