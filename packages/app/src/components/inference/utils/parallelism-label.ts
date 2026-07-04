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
 */
export const configSegmentLabel = (
  tp: number,
  ep: number | undefined,
  dpAttention: boolean | undefined,
): string => {
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) {
    return dpAttention ? `DEP${tp}` : `TEP${tp}`;
  }
  const dpaPrefix = dpAttention ? 'DPA' : '';
  if (ep === null || ep === undefined || ep <= 1) return `${dpaPrefix}TP${tp}`;
  return `${dpaPrefix}EP${ep}`;
};

/** Parallelism params for one benchmark config, framework-agnostic. */
export interface ParallelismFields {
  tp: number;
  ep?: number;
  dpAttention?: boolean;
  disagg?: boolean;
  isMultinode?: boolean;
  prefillTp?: number;
  prefillEp?: number;
  prefillDpAttention?: boolean;
  prefillNumWorkers?: number;
  decodeTp?: number;
  decodeEp?: number;
  decodeDpAttention?: boolean;
  decodeNumWorkers?: number;
}

/**
 * Returns the short parallelism label for a config.
 * - No EP data (old rows): falls back to the bare tp value (e.g. "8").
 * - Multinode disagg: per-role segments with worker counts,
 *   e.g. "2xEP4+1xDPAEP32".
 * - Otherwise: a single segment from (tp, ep, dpAttention).
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
    );
    const decodeLabel = configSegmentLabel(
      f.decodeTp ?? f.tp,
      f.decodeEp ?? f.ep,
      f.decodeDpAttention ?? f.dpAttention,
    );
    const pw = f.prefillNumWorkers ?? 1;
    const dw = f.decodeNumWorkers ?? 1;
    return `${pw}x${prefillLabel}+${dw}x${decodeLabel}`;
  }

  return configSegmentLabel(f.tp, f.ep, f.dpAttention);
};
