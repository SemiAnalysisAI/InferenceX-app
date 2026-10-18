/**
 * Handwired port of `hermiteInterpolate` (components/calculator/interpolation.ts).
 *
 * Experimental. Nothing in production imports this module. It exists to measure
 * what happens when one of the dashboard's hottest numeric paths is compiled into
 * a feed-forward ReLU / ReGLU network with https://github.com/chenglou/handwired
 * instead of running as branchy JavaScript.
 *
 * The knots, slopes and segment polynomials are known when the network is built,
 * so they become weights and biases. The only runtime input is the target x. The
 * network has no trained parameters: every weight is written by `compileHermite`.
 *
 * Construction (one network per frontier). The host clamps x into [x0, x_{n-1}]
 * (the spline is flat outside, so this never changes the result) and feeds two
 * cells: x itself and, by default, xg = floor(x) on a power-of-two grid (see
 * HermiteOptions.grid):
 *
 *   g_i     = [xg >= ceil(x_i)]         i = 1..n-2      exact bits (2 ops each on the grid,
 *                                                       a sign cascade without it)
 *   seg_i   = g_i - g_{i+1}                             one-hot segment, affine
 *   X       = Σ seg_i x_i                               selected left knot, affine
 *   T       = (x - X) * relu(Σ seg_i/h_i)               local t, one ReGLU
 *   Tc      = relu(T)
 *   h00..h11 = Hermite basis of Tc                       affine in Tc, Tc², Tc³ (2 ReGLU)
 *   y       = YL·h00 + YH·h01 + h·ML·h10 + h·MH·h11     4 ReGLU products; YL, YH, ML, MH are
 *                                                       the selected knot values/slopes (affine)
 *
 * which is the same piecewise Hermite cubic that `hermiteInterpolate` evaluates
 * after its binary search.
 *
 * Numerics: the default generated backend runs the arithmetic in FP64 like the JS
 * original and keeps FP32 rounding only where Handwired's comparison bits need
 * it. The tensor backend and precision 'f32' round every op to FP32.
 * See hermite-circuit.test.ts and scripts/handwired/bench.ts for measured bounds.
 */

import { generateProgram, type Precision } from './codegen';
import { Circuit, emitCompare, type Wire } from './vendor/numeric-ui-core';

export interface HermiteNetwork {
  /** Evaluate the network at x. Same contract as hermiteInterpolate(xs, ys, m, x). */
  (x: number): number;
  /** Weights stored by the compiled tensor program (non-zero matrix entries + biases). */
  readonly weightCount: number;
  /** Layers in the compiled tensor program (network depth). */
  readonly layerCount: number;
  /** Live operations (neurons) in the compiled program. */
  readonly operationCount: number;
}

function constantNetwork(value: number): HermiteNetwork {
  return Object.assign((_x: number) => value, { weightCount: 1, layerCount: 0, operationCount: 0 });
}

export interface HermiteOptions {
  /**
   * 'tensor': Handwired's generic tensor executor (the original PR).
   * 'generated': the same network emitted as straight-line JS (codegen.ts). Default.
   */
  backend?: 'tensor' | 'generated';
  /**
   * Generated backend only. 'f32' matches Handwired's reference evaluator bit for
   * bit. 'f64' keeps FP32 rounding only at the comparison-bit atoms and runs the
   * arithmetic in FP64 like the original JS. Default 'f64'.
   */
  precision?: Precision;
  /**
   * Run the knot tests on floor(x) over a power-of-two grid, so each test is a
   * 2-op integer bit instead of a ~14-layer sign cascade. The arithmetic still
   * uses the exact x. Tests can only fire late, inside a sliver narrower than
   * one grid step (2^-14 for frontiers up to 1,024 tok/s/user) above a knot,
   * where the previous cubic is extrapolated. Default true.
   */
  grid?: boolean;
}

/** Smallest power of two g with (hi - lo) / g <= 2^24, the integer-bit limit. */
function gridFor(lo: number, hi: number): number {
  return 2 ** Math.ceil(Math.log2((hi - lo) / 2 ** 24));
}

export function compileHermite(
  xs: readonly number[],
  ys: readonly number[],
  m: readonly number[],
  options: HermiteOptions = {},
): HermiteNetwork {
  const backend = options.backend ?? 'generated';
  const useGrid = options.grid ?? true;
  const n = xs.length;
  if (n === 0) return constantNetwork(0);
  if (n === 1) return constantNetwork(ys[0]);

  // Host-side input normalization. Clamping x into [x0, x_{n-1}] never changes the
  // result (the spline is flat outside), and it fixes the network's domain.
  const lo = xs[0];
  const hi = xs[n - 1];
  const grid = useGrid ? gridFor(Math.min(0, lo), Math.max(hi, 1)) : 0;
  // Two source cells: the exact x drives the arithmetic, and xg = floor_grid(x)
  // drives the knot tests. For xg on the grid, [xg >= ceil_grid(k)] implies
  // x >= k, so a test can only fire late, never early: reads in the sliver
  // [k, ceil_grid(k)) use the previous segment's cubic, extrapolated by less
  // than one grid step past its end. The spline is C1 there, so that costs
  // O(grid^2) instead of O(grid) for rounding x itself.
  const floorGrid = (v: number) => (grid === 0 ? v : Math.floor(v / grid) * grid);
  const threshold = (k: number) => (grid === 0 ? k : Math.ceil(k / grid) * grid);
  const circuit = new Circuit(2);
  const xc = circuit.source(0);
  const xg = circuit.source(1);
  circuit.assumeRange(xc, Math.fround(lo), Math.fround(hi));
  circuit.assumeRange(xg, Math.fround(floorGrid(lo)), Math.fround(floorGrid(hi)));
  if (grid !== 0) circuit.assumeGrid(xg, grid);

  // g_i = [x >= x_i] for the interior knots; g_0 = 1, g_{n-1} = 0 (x_{n-1}
  // belongs to the last segment, where t = 1 gives ys[n-1]).
  const ones = circuit.constant(1);
  const zero = circuit.constant(0);
  const g: Wire[] = [ones];
  for (let i = 1; i < n - 1; i++)
    g.push(emitCompare(circuit, xg, '>=', circuit.constant(threshold(xs[i]))));
  g.push(zero);

  // Per-segment cubic coefficients in the local t, and the affine map x -> t.
  const segTerms = (coef: (i: number) => number) => {
    const terms: [Wire, number][] = [];
    let bias = 0;
    for (let i = 0; i < n - 1; i++) {
      const c = coef(i);
      if (c === 0) continue;
      // seg_i = g_i - g_{i+1}; constant g's fold into the bias.
      if (i === 0) bias += c;
      else terms.push([g[i], c]);
      if (i + 1 < n - 1) terms.push([g[i + 1], -c]);
    }
    return { terms, bias };
  };

  const h = (i: number) => xs[i + 1] - xs[i];
  const a = (i: number) => ys[i];
  const b = (i: number) => (h(i) === 0 ? 0 : h(i) * m[i]);
  const invH = (i: number) => (h(i) === 0 ? 0 : 1 / h(i));
  const knot = (i: number) => (h(i) === 0 ? 0 : xs[i]);

  const P = segTerms(invH);
  const X = segTerms(knot);
  // T = (xc - X) * P. Subtracting the selected knot first keeps the difference
  // exact in FP32 (xc and X are close), instead of cancelling xc*P against
  // X*P. P >= 0, so (xc - X) * relu(P) is a single ReGLU.
  const T = circuit.reglu(
    [[xc, 1], ...X.terms.map(([w, k]) => [w, -k] as [Wire, number])],
    -X.bias,
    P.terms,
    P.bias,
  );
  // T >= 0 by construction (the selected knot is <= x); relu guards FP32 noise.
  // No upper clamp, so the late-firing sliver above extrapolates smoothly.
  const Tc = circuit.reglu([], 1, [[T, 1]], 0);
  circuit.assumeRange(Tc, 0, 2, { allowExistingReaders: true });
  const T2 = circuit.reglu([[Tc, 1]], 0, [[Tc, 1]], 0);
  circuit.assumeRange(T2, 0, 4, { allowExistingReaders: true });
  const T3 = circuit.reglu([[T2, 1]], 0, [[Tc, 1]], 0);
  circuit.assumeRange(T3, 0, 8, { allowExistingReaders: true });

  // Hermite basis on the local t. Each basis is exact at t = 0 and t = 1, so a
  // knot read returns that knot's FP32 value exactly (an expanded monomial form
  // a + b t + c t^2 + d t^3 would not). The ReGLU gate is relu(gate), so the
  // network gates on -h11 (h11 <= 0 on [0, 1]); FP32 noise below 0 gates to 0.
  const h00 = circuit.affine(
    [
      [T3, 2],
      [T2, -3],
    ],
    1,
  ); //  2t^3 - 3t^2 + 1
  const h01 = circuit.affine([
    [T3, -2],
    [T2, 3],
  ]); //    -2t^3 + 3t^2
  const h10 = circuit.affine([
    [T3, 1],
    [T2, -2],
    [Tc, 1],
  ]); // t^3 - 2t^2 + t
  const nh11 = circuit.affine([
    [T3, -1],
    [T2, 1],
  ]); //  -(t^3 - t^2)

  const YL = segTerms(a);
  const YH = segTerms((i) => (h(i) === 0 ? 0 : ys[i + 1]));
  const ML = segTerms(b);
  const MH = segTerms((i) => (h(i) === 0 ? 0 : -h(i) * m[i + 1]));
  const y = circuit.affine([
    [circuit.reglu(YL.terms, YL.bias, [[h00, 1]], 0), 1],
    [circuit.reglu(YH.terms, YH.bias, [[h01, 1]], 0), 1],
    [circuit.reglu(ML.terms, ML.bias, [[h10, 1]], 0), 1],
    [circuit.reglu(MH.terms, MH.bias, [[nh11, 1]], 0), 1],
  ]);
  // Stats come from Handwired's tensor compiler. The generated backend doesn't
  // need that program to run, so build it lazily, only when stats are read.
  let program: ReturnType<Circuit['compileTensorProgram']> | undefined;
  const getProgram = () => (program ??= circuit.compileTensorProgram([y], true));
  const stats = {
    get weightCount() {
      return getProgram().layers.reduce((sum, l) => sum + l.weights.length + l.bias.length, 0);
    },
    get layerCount() {
      return getProgram().layers.length;
    },
    get operationCount() {
      return getProgram().layers.reduce((sum, l) => sum + l.outputSize, 0);
    },
  };
  const withStats = (fn: (x: number) => number): HermiteNetwork =>
    Object.defineProperties(fn, Object.getOwnPropertyDescriptors(stats)) as HermiteNetwork;
  const clampX = (target: number) => (target < lo ? lo : target > hi ? hi : target);

  if (backend === 'generated') {
    const { run, weights } = generateProgram(circuit, y, options.precision ?? 'f64');
    const invGrid = grid === 0 ? 0 : 1 / grid;
    return withStats((target: number) => {
      const x = clampX(target);
      // grid is a power of two, so x * (1 / grid) is exact.
      return run(weights, x, grid === 0 ? x : Math.floor(x * invGrid) * grid);
    });
  }
  const evaluate = circuit.createTensorProgramEvaluator(getProgram());
  const source = new Float32Array(2);
  return withStats((target: number) => {
    const x = clampX(target);
    source[0] = x;
    source[1] = floorGrid(x);
    return evaluate(source)[0];
  });
}

/**
 * Networks keyed by frontier contents. Call sites rebuild their xs/ys arrays on
 * every call (tco-feed, trend charts), so an identity-keyed cache almost never
 * hits; a content hash does, so each distinct frontier compiles once. Entries
 * keep copies of their inputs and are verified on hit, so collisions are safe.
 */
interface Entry {
  xs: number[];
  ys: number[];
  m: number[];
  net: HermiteNetwork;
}
const cache = new Map<number, Entry[]>();
const CACHE_LIMIT = 4096;
let cached = 0;
const scratch = new Float64Array(1);
const bits = new Uint32Array(scratch.buffer);

function hashInto(h: number, values: readonly number[]): number {
  for (const v of values) {
    scratch[0] = v;
    h = Math.imul(h ^ bits[0], 0x01000193);
    h = Math.imul(h ^ bits[1], 0x01000193);
  }
  return h;
}

const same = (a: readonly number[], b: readonly number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};

/** Drop-in for hermiteInterpolate that compiles (and caches) one network per frontier. */
export function hermiteInterpolateHandwired(
  xs: number[],
  ys: number[],
  m: number[],
  targetX: number,
): number {
  const key = hashInto(hashInto(hashInto(0x811c9dc5, xs), ys), m);
  let bucket = cache.get(key);
  if (bucket) {
    for (const e of bucket)
      if (same(e.xs, xs) && same(e.ys, ys) && same(e.m, m)) return e.net(targetX);
  } else {
    if (cached >= CACHE_LIMIT) {
      cache.clear();
      cached = 0;
    }
    bucket = [];
    cache.set(key, bucket);
  }
  const net = compileHermite(xs, ys, m);
  bucket.push({ xs: [...xs], ys: [...ys], m: [...m], net });
  cached++;
  return net(targetX);
}
