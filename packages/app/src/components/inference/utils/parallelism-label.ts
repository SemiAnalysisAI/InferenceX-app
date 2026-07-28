/**
 * Shared parallelism-config labeling — the single source of truth for the
 * short "TP8 / EP8 / TEP8 / DEP8 / DPAEP8 / 2xEP4+1xDPAEP32" labels.
 *
 * Used by the scatter/GPU chart point labels (via getPointLabel) and the
 * agentic detail page's sibling navigator chips, so both surfaces describe a
 * config identically.
 */

/**
 * Generates a short config segment label from parallelism params.
 * - tp == ep and dp-attn false: "TEP{N}"
 * - tp == ep and dp-attn true: "DEP{N}"
 * - ep > 1 (tp != ep): "EP{ep}" or "DPAEP{ep}"
 * - ep <= 1 (or no EP): "TP{tp}" or "DPATP{tp}"
 * - pp > 1 appends a "PP{pp}" suffix (e.g. "TP8PP2"); pp <= 1 or absent
 *   renders nothing so pre-PP labels stay byte-identical.
 */
export const configSegmentLabel = (
  tp: number,
  ep: number | undefined,
  dpAttention: boolean | undefined,
  pp?: number,
): string => {
  const ppSuffix = pp !== null && pp !== undefined && pp > 1 ? `PP${pp}` : '';
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) {
    return `${dpAttention ? 'DEP' : 'TEP'}${tp}${ppSuffix}`;
  }
  const dpaPrefix = dpAttention ? 'DPA' : '';
  if (ep === null || ep === undefined || ep <= 1) return `${dpaPrefix}TP${tp}${ppSuffix}`;
  return `${dpaPrefix}EP${ep}${ppSuffix}`;
};

/** Parallelism params for one benchmark config, framework-agnostic. */
export interface ParallelismFields {
  tp: number;
  ep?: number;
  /** Pipeline parallelism. Only rendered when > 1. */
  pp?: number;
  dpAttention?: boolean;
  disagg?: boolean;
  isMultinode?: boolean;
  prefillTp?: number;
  prefillEp?: number;
  prefillPp?: number;
  prefillDpAttention?: boolean;
  prefillNumWorkers?: number;
  decodeTp?: number;
  decodeEp?: number;
  decodePp?: number;
  decodeDpAttention?: boolean;
  decodeNumWorkers?: number;
}

/**
 * Returns the short parallelism label for a config.
 * - No EP data (old rows): falls back to the bare tp value (e.g. "8").
 * - Multinode disagg: per-role segments with worker counts,
 *   e.g. "2xEP4+1xDPAEP32". A role with zero workers AND zero TP (prefill-only
 *   agentic multinode runs emit decode_num_workers=0 / decode_tp=0) doesn't
 *   exist — only the active side is rendered, without the "Nx" multiplier
 *   when it has a single worker (e.g. "TP8PP2", not "1xTP8PP2+0xTP0").
 * - Otherwise: a single segment from (tp, ep, dpAttention, pp).
 */
export const parallelismLabel = (f: ParallelismFields): string => {
  if (
    (f.ep === null || f.ep === undefined) &&
    (f.prefillEp === null || f.prefillEp === undefined)
  ) {
    return String(f.tp);
  }

  if (f.isMultinode && f.disagg) {
    const prefillLabel = configSegmentLabel(
      f.prefillTp ?? f.tp,
      f.prefillEp ?? f.ep,
      f.prefillDpAttention ?? f.dpAttention,
      f.prefillPp ?? f.pp,
    );
    const decodeLabel = configSegmentLabel(
      f.decodeTp ?? f.tp,
      f.decodeEp ?? f.ep,
      f.decodeDpAttention ?? f.dpAttention,
      f.decodePp ?? f.pp,
    );
    const pw = f.prefillNumWorkers ?? 1;
    const dw = f.decodeNumWorkers ?? 1;
    const prefillAbsent = pw === 0 && (f.prefillTp ?? f.tp) === 0;
    const decodeAbsent = dw === 0 && (f.decodeTp ?? f.tp) === 0;
    if (decodeAbsent && !prefillAbsent) return pw > 1 ? `${pw}x${prefillLabel}` : prefillLabel;
    if (prefillAbsent && !decodeAbsent) return dw > 1 ? `${dw}x${decodeLabel}` : decodeLabel;
    return `${pw}x${prefillLabel}+${dw}x${decodeLabel}`;
  }

  return configSegmentLabel(f.tp, f.ep, f.dpAttention, f.pp);
};
