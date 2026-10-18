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
 * Construction (one network per frontier):
 *
 *   xc      = clamp(x, x0, x_{n-1})                     exact min/max, ReLU form
 *   g_i     = [xc >= x_i]               i = 1..n-2      exact bits (sign cascade)
 *   seg_i   = g_i - g_{i+1}                             one-hot segment, affine
 *   X       = Σ seg_i x_i                               selected left knot, affine
 *   T       = (xc - X) * Σ seg_i/h_i                    local t in [0, 1], one ReGLU
 *   h00..h11 = Hermite basis of T                        affine in T, T², T³ (2 ReGLU)
 *   y       = YL·h00 + YH·h01 + h·ML·h10 + h·MH·h11     4 ReGLU products; YL, YH, ML, MH are
 *                                                       the selected knot values/slopes (affine)
 *   out     = [xc >= x_{n-1}] ? y_{n-1} : y             exact right-end return, like the JS
 *
 * which is the same piecewise Hermite cubic that `hermiteInterpolate` evaluates
 * after its binary search.
 *
 * Numerics: everything runs in FP32 (Math.fround after every op), the JS original
 * runs in FP64. Segment decisions are exact for the FP32 value of x; the value
 * differs from FP64 by FP32 rounding. See handwired-hermite.test.ts for bounds.
 */

import {
  Circuit,
  emitCompare,
  emitMaximumExact,
  emitMinimumExact,
  emitSelect,
  type Wire,
} from './vendor/numeric-ui-core';

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

/**
 * Declared input range of the x cell. The comparisons' cost depends on it, and
 * the evaluator refuses values outside it, so the host clamps into it first.
 * Outside [x0, x_{n-1}] the spline is flat, so as long as the range covers every
 * knot, this host-side clamp never changes the result.
 */
function inputRange(xs: readonly number[]): [number, number] {
  const lo = Math.min(0, xs[0]);
  const hi = Math.max(16_384, xs.at(-1)! * 2);
  return [Math.fround(lo), Math.fround(hi)];
}

function constantNetwork(value: number): HermiteNetwork {
  return Object.assign((_x: number) => value, { weightCount: 1, layerCount: 0, operationCount: 0 });
}

export function compileHermite(
  xs: readonly number[],
  ys: readonly number[],
  m: readonly number[],
): HermiteNetwork {
  const n = xs.length;
  if (n === 0) return constantNetwork(0);
  if (n === 1) return constantNetwork(ys[0]);

  const [rangeLo, rangeHi] = inputRange(xs);
  const circuit = new Circuit(1);
  const x = circuit.source(0);
  circuit.assumeRange(x, rangeLo, rangeHi);

  // xc = clamp(x, x0, x_{n-1})
  const xc = emitMinimumExact(
    circuit,
    emitMaximumExact(circuit, x, circuit.constant(xs[0])),
    circuit.constant(xs[n - 1]),
  );
  circuit.assumeRange(xc, Math.fround(xs[0]), Math.fround(xs[n - 1]), {
    allowExistingReaders: true,
  });

  // g_i = [xc >= x_i] for the interior knots; g_0 = 1, g_{n-1} = 0 (the last
  // knot belongs to the last segment, where t = 1 gives ys[n-1] exactly as the
  // JS early return does).
  const ones = circuit.constant(1);
  const zero = circuit.constant(0);
  const g: Wire[] = [ones];
  for (let i = 1; i < n - 1; i++) g.push(emitCompare(circuit, xc, '>=', circuit.constant(xs[i])));
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
  // FP32 cancellation can push T a hair outside [0, 1]; clamp so every gate is >= 0.
  const Tc = emitMinimumExact(circuit, emitMaximumExact(circuit, T, zero), ones);
  circuit.assumeRange(Tc, 0, 1, { allowExistingReaders: true });
  const T2 = circuit.reglu([[Tc, 1]], 0, [[Tc, 1]], 0);
  circuit.assumeRange(T2, 0, 1, { allowExistingReaders: true });
  const T3 = circuit.reglu([[T2, 1]], 0, [[Tc, 1]], 0);
  circuit.assumeRange(T3, 0, 1, { allowExistingReaders: true });

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
  // JS returns ys[n-1] for x >= x_{n-1}. In FP32, (x_{n-1} - x_{n-2}) * (1/h) can
  // round to 1 - 2^-24, so mirror that early return with one more exact bit.
  // (At the left end and at interior knots, xc - X is exactly 0, so t = 0.)
  const atEnd = emitCompare(circuit, xc, '>=', circuit.constant(xs[n - 1]));
  const out = emitSelect(circuit, atEnd, y, circuit.constant(ys[n - 1]));

  const program = circuit.compileTensorProgram([out], true);
  const evaluate = circuit.createTensorProgramEvaluator(program);
  const source = new Float32Array(1);
  let weightCount = 0;
  for (const layer of program.layers) weightCount += layer.weights.length + layer.bias.length;
  const operationCount = program.layers.reduce((sum, layer) => sum + layer.outputSize, 0);

  const run = (target: number) => {
    source[0] = target < rangeLo ? rangeLo : target > rangeHi ? rangeHi : target;
    return evaluate(source)[0];
  };
  return Object.assign(run, {
    weightCount,
    layerCount: program.layers.length,
    operationCount,
  });
}

/** Networks keyed by frontier identity, so repeated reads compile once. */
const cache = new WeakMap<readonly number[], WeakMap<readonly number[], HermiteNetwork>>();

/** Drop-in for hermiteInterpolate that compiles (and caches) one network per frontier. */
export function hermiteInterpolateHandwired(
  xs: number[],
  ys: number[],
  m: number[],
  targetX: number,
): number {
  let byYs = cache.get(xs);
  if (!byYs) cache.set(xs, (byYs = new WeakMap()));
  let net = byYs.get(ys);
  if (!net) byYs.set(ys, (net = compileHermite(xs, ys, m)));
  return net(targetX);
}
