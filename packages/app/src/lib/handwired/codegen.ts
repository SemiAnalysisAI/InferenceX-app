/**
 * Straight-line JavaScript backend for a Handwired circuit.
 *
 * Emits one `const` per live operation (affine / ReGLU / boolean atom), in
 * operation order, with the reference evaluator's exact FP32 rounding
 * (`Circuit.evaluateReference`: fround(bias), then fround(acc + fround(fround(w) * v))
 * per term). The network, its weights and every intermediate bit are the same as
 * the tensor executor's; this only removes the interpreter (layer loop, sparse
 * index arrays, range validation per call), which is what dominates per-read cost.
 *
 * Weights are not inlined: every frontier-specific constant goes into a
 * Float32Array, and the code only references `w[k]`. Frontiers whose networks
 * have the same shape share one compiled function, so the JIT sees a handful of
 * hot functions instead of one cold function per frontier. (Inlined literals
 * measured ~1.6x slower than the tensor interpreter for exactly that reason.)
 *
 * Uses `new Function`, so it needs a CSP that allows `unsafe-eval` in browsers.
 */
import type { Circuit, Wire } from './vendor/numeric-ui-core';

type Terms = readonly (readonly [Wire, number])[];

/** Compiled functions keyed by source; the source depends only on network shape. */
export type Compiled = (w: Float32Array | Float64Array, ...source: number[]) => number;
const shapes = new Map<string, Compiled>();

export interface GeneratedProgram {
  /**
   * Shared compiled function for this network shape: call as
   * `run(weights, source0, source1, ...)`. Call it directly (no rest/spread
   * wrapper) so the JIT can inline it.
   */
  run: Compiled;
  weights: Float32Array | Float64Array;
  liveOperations: number;
  sourceBytes: number;
  /** Distinct network shapes compiled so far (process-wide). */
  shapeCount: number;
}

export type Precision = 'f32' | 'f64';

/**
 * precision 'f32' reproduces the reference evaluator bit for bit.
 * precision 'f64' keeps FP32 rounding only at boolean atoms (the rounding points
 * that make comparison bits exact) and runs every affine / ReGLU op in FP64,
 * like the JavaScript it replaces.
 */
export function generateProgram(
  circuit: Circuit,
  root: Wire,
  precision: Precision = 'f32',
): GeneratedProgram {
  const r = precision === 'f32' ? 'f' : '';
  const { sourceSize, operations } = circuit;
  const live = new Uint8Array(sourceSize + operations.length);
  const stack: number[] = [root];
  while (stack.length > 0) {
    const wire = stack.pop()!;
    if (live[wire] === 1) continue;
    live[wire] = 1;
    if (wire < sourceSize) continue;
    const op = operations[wire - sourceSize];
    if (op.kind === 'index') throw new Error('codegen: index reads are not supported');
    for (const [w] of op.leftTerms) stack.push(w);
    if (op.kind === 'reglu') for (const [w] of op.gateTerms) stack.push(w);
  }

  const name = (wire: number) => (wire < sourceSize ? `s${wire}` : `v${wire}`);
  const weights: number[] = [];
  const literal = (value: number) => {
    const v = precision === 'f32' ? Math.fround(value) : value;
    if (v === 0 || v === 1 || v === -1) return Object.is(v, -0) ? '-0' : String(v);
    weights.push(v);
    return `w[${weights.length - 1}]`;
  };
  // Reference fold: acc = f(bias); acc = f(acc + f(f(w) * v)) per term.
  const sum = (terms: Terms, bias: number) => {
    let text = literal(bias);
    for (const [wire, coefficient] of terms) {
      const c = precision === 'f32' ? Math.fround(coefficient) : coefficient;
      const product =
        c === 1 ? name(wire) : c === -1 ? `-${name(wire)}` : `${r}(${literal(c)} * ${name(wire)})`;
      text = `${r}(${text} + ${product})`;
    }
    return text;
  };

  const lines: string[] = [];
  let count = 0;
  for (let i = 0; i < operations.length; i++) {
    const wire = sourceSize + i;
    if (live[wire] === 0) continue;
    count++;
    const op = operations[i];
    const left = sum(op.leftTerms, op.leftBias);
    if (op.kind === 'affine') lines.push(`const ${name(wire)} = ${left};`);
    else if (op.kind === 'boolean')
      lines.push(`const ${name(wire)} = f(f(f(${left}) + 8388609) - 8388609);`);
    else
      lines.push(
        `const ${name(wire)} = ${r}(${left} * Math.max(0, ${sum(op.gateTerms, op.gateBias)}));`,
      );
  }
  const body = lines.join('\n');
  const args = Array.from({ length: sourceSize }, (_, i) => `a${i}`);
  const source = `"use strict";
const f = Math.fround;
return function (w, ${args.join(', ')}) {
${args.map((a, i) => `const s${i} = ${r}(${a});`).join(' ')}
${body}
return ${name(root)}; };`;
  let fn = shapes.get(source);
  if (!fn) {
    fn = (Reflect.construct(Function, [source]) as () => Compiled)();
    shapes.set(source, fn);
  }
  const w = precision === 'f32' ? Float32Array.from(weights) : Float64Array.from(weights);
  return {
    run: fn,
    weights: w,
    liveOperations: count,
    sourceBytes: source.length,
    shapeCount: shapes.size,
  };
}
