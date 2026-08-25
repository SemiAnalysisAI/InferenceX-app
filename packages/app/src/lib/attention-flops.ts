/**
 * Model-specific attention-FLOPs accounting for the
 * "New Input Suffix + Output TFLOP/s per Chip" y-metric.
 *
 * ## What is counted
 *
 * Activation–activation attention compute only: QK^T score matmuls,
 * attention-weighted value aggregation (AV), sparse-attention indexer
 * scoring, and linear-attention (KDA) state update/readout. Weight matmuls
 * (Q/K/V/O projections, indexer weight projections, MLA up/down projections)
 * are EXCLUDED — they are covered by the separate `2 × N_active_params`
 * GEMM term (Kaplan et al. / PaLM appendix convention,
 * https://arxiv.org/pdf/2204.02311). One multiply-accumulate = 2 FLOPs.
 *
 * ## Per-layer-group cost model
 *
 * Every supported architecture's per-computed-token attention cost at
 * context length L reduces to the affine-plus-capped form
 *
 *   F_group(L) = linPerCtx · L + capped.coeff · min(L, capped.cap) + constPerToken
 *
 * summed over layer groups (× layer count). Examples:
 * - Dense GQA/MHA/absorbed-MLA: pure `linPerCtx` (4·H·d·L or 2·H·(d_s+d_v)·L).
 * - Sliding-window layers (gpt-oss): capped term with cap = window.
 * - Top-k sparse attention (DSA/MSA): dense indexer scoring is `linPerCtx`,
 *   the main attention over the selected set is a capped term with
 *   cap = token budget (e.g. DeepSeek-V4-Pro CSA's
 *   262,144·min(1024, L/4) rewrites to 65,536·min(L, 4096)).
 * - Linear attention (Kimi K3 KDA): `constPerToken`, independent of L.
 *
 * ## Integration over the request population
 *
 * The DB layer stores exact joint sums over each run's per-request
 * (ISL, OSL) pairs (`RequestLengthMoments`). With the theoretical cache hit
 * rate r (infinite-cache prefix share of the prompt, so a request with
 * prompt P computes its suffix of (1−r)·P tokens at contexts r·P+1 … P,
 * then decodes O tokens at contexts P+1 … P+O — cached-prefix tokens are
 * NOT recomputed but ARE attended over by every computed token):
 *
 *   Σ contexts  = (1−r²)/2·ΣP² + (1−r)/2·ΣP + Σ(P·O) + (ΣO² + ΣO)/2
 *   Σ tokens    = (1−r)·ΣP + ΣO
 *
 * both exact given the stored moments. Capped terms use
 * Σ min(L, cap) ≈ min(cap · Σtokens, Σcontexts) — an upper bound (min is
 * concave) that is exact when every context is on the same side of the cap;
 * agentic traces overwhelmingly sit far above the small caps (128-token
 * windows) and the error is bounded by the capped term itself for the
 * large caps (2048/4096-token budgets).
 *
 * Per-model formulas and dimensions were verified against HF configs and
 * tech reports; sources are cited on each spec in model-architectures.ts.
 */

/**
 * Exact joint (ISL, OSL) sums over a run's request population. Mirrors
 * `RequestLengthMoments` in packages/db/src/queries/agentic-shared.ts
 * (served through the derived-agentic-metrics endpoint).
 */
export interface RequestLengthMoments {
  /** Number of requests with both ISL and OSL present. */
  n: number;
  /** Σ ISL_i */
  sumIsl: number;
  /** Σ ISL_i² */
  sumIslSq: number;
  /** Σ OSL_i */
  sumOsl: number;
  /** Σ OSL_i² */
  sumOslSq: number;
  /** Σ ISL_i·OSL_i */
  sumIslOsl: number;
}

/**
 * One group of identical attention layers. Per computed token at context L
 * the group costs
 *   layers × (linPerCtx·L + capped.coeff·min(L, capped.cap) + constPerToken)
 * FLOPs (MAC = 2 FLOPs; omitted fields default to 0).
 */
export interface AttentionLayerGroup {
  /** Human-readable mechanism label (documentation only). */
  label: string;
  /** Number of layers of this type. */
  layers: number;
  /** FLOPs per computed token per unit of context (the a·L term). */
  linPerCtx?: number;
  /** Capped term b·min(L, cap): sliding windows and top-k token budgets. */
  capped?: { coeff: number; cap: number };
  /** Context-independent FLOPs per computed token (linear attention). */
  constPerToken?: number;
}

/** Full attention-cost specification for one model. */
export interface AttentionCostSpec {
  groups: AttentionLayerGroup[];
}

/** Closed-form Σ over all computed tokens of their context lengths. */
export function sumContexts(moments: RequestLengthMoments, rate: number): number {
  const oneMinusR = 1 - rate;
  return (
    ((1 - rate * rate) / 2) * moments.sumIslSq +
    (oneMinusR / 2) * moments.sumIsl +
    moments.sumIslOsl +
    (moments.sumOslSq + moments.sumOsl) / 2
  );
}

/** Total computed (non-cached) tokens: suffix prefill + decode. */
export function sumComputedTokens(moments: RequestLengthMoments, rate: number): number {
  return (1 - rate) * moments.sumIsl + moments.sumOsl;
}

/**
 * Average attention FLOPs per computed token for a run, integrating the
 * model's per-layer-group cost over the request-length distribution at the
 * given theoretical cache hit rate.
 *
 * Returns null when the moments are unusable (no paired requests, or no
 * computed tokens — e.g. rate = 1 with zero output tokens).
 */
export function attentionFlopsPerComputedToken(
  spec: AttentionCostSpec,
  moments: RequestLengthMoments,
  rate: number,
): number | null {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  if (!moments || moments.n <= 0) return null;
  const nTokens = sumComputedTokens(moments, rate);
  if (!Number.isFinite(nTokens) || nTokens <= 0) return null;
  const sumCtx = sumContexts(moments, rate);
  if (!Number.isFinite(sumCtx) || sumCtx < 0) return null;

  let totalFlops = 0;
  for (const g of spec.groups) {
    const lin = (g.linPerCtx ?? 0) * sumCtx;
    const capped = g.capped ? g.capped.coeff * Math.min(g.capped.cap * nTokens, sumCtx) : 0;
    const constant = (g.constPerToken ?? 0) * nTokens;
    totalFlops += g.layers * (lin + capped + constant);
  }
  return totalFlops / nTokens;
}
