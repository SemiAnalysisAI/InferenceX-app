export const meaningfulParallelismSize = (
  ...values: (number | null | undefined)[]
): number | undefined => {
  const sizes = values.filter(
    (value): value is number => value !== null && value !== undefined && value > 1,
  );
  return sizes.length > 0 ? Math.max(...sizes) : undefined;
};

export const configSegmentLabel = (
  tp: number,
  ep: number | undefined,
  dpAttention: boolean | undefined,
  pp?: number,
  dcp?: number,
  pcp?: number,
  dp?: number,
  dwdp?: number,
): string => {
  const ppSuffix = pp !== null && pp !== undefined && pp > 1 ? `PP${pp}` : '';
  const dcpSuffix = dcp !== null && dcp !== undefined && dcp > 1 ? `/DCP${dcp}` : '';
  const pcpSuffix = pcp !== null && pcp !== undefined && pcp > 1 ? `/PCP${pcp}` : '';
  const suffix = `${ppSuffix}${dcpSuffix}${pcpSuffix}${dp && dp > 1 ? `/DP${dp}` : ''}`;
  if (dwdp !== undefined && Number.isInteger(dwdp) && dwdp > 1) return `DWDP${dwdp}${suffix}`;
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) {
    return `${dpAttention ? 'DEP' : 'TEP'}${tp}${suffix}`;
  }
  const dpaPrefix = dpAttention ? 'DPA' : '';
  if (ep === null || ep === undefined || ep <= 1) return `${dpaPrefix}TP${tp}${suffix}`;
  return `${dpaPrefix}EP${ep}${suffix}`;
};

export interface ParallelismFields {
  tp: number;
  dp?: number;
  ep?: number;
  pp?: number;
  dcp?: number;
  pcp?: number;
  dpAttention?: boolean;
  disagg?: boolean;
  isMultinode?: boolean;
  prefillTp?: number;
  prefillEp?: number;
  prefillPp?: number;
  prefillDcp?: number;
  prefillPcp?: number;
  prefillDwdp?: number;
  prefillDpAttention?: boolean;
  prefillNumWorkers?: number;
  decodeTp?: number;
  decodeEp?: number;
  decodePp?: number;
  decodeDcp?: number;
  decodePcp?: number;
  decodeDpAttention?: boolean;
  decodeNumWorkers?: number;
}

export const parallelismLabel = (f: ParallelismFields): string => {
  if (
    (f.ep === null || f.ep === undefined) &&
    (f.prefillEp === null || f.prefillEp === undefined) &&
    !(f.prefillDwdp && f.prefillDwdp > 1)
  ) {
    return f.dp && f.dp > 1 ? `TP${f.tp}/DP${f.dp}` : String(f.tp);
  }

  if (f.isMultinode && f.disagg) {
    const prefillLabel = configSegmentLabel(
      f.prefillTp ?? f.tp,
      f.prefillEp ?? f.ep,
      f.prefillDpAttention ?? f.dpAttention,
      f.prefillPp ?? f.pp,
      f.prefillDcp ?? f.dcp,
      f.prefillPcp ?? f.pcp,
      undefined,
      f.prefillDwdp,
    );
    const decodeLabel = configSegmentLabel(
      f.decodeTp ?? f.tp,
      f.decodeEp ?? f.ep,
      f.decodeDpAttention ?? f.dpAttention,
      f.decodePp ?? f.pp,
      f.decodeDcp ?? f.dcp,
      f.decodePcp ?? f.pcp,
    );
    const pw = f.prefillNumWorkers ?? 1;
    const dw = f.decodeNumWorkers ?? 1;
    const prefillAbsent = pw === 0 && (f.prefillTp ?? f.tp) === 0;
    const decodeAbsent = dw === 0 && (f.decodeTp ?? f.tp) === 0;
    if (decodeAbsent && !prefillAbsent) return pw > 1 ? `${pw}x${prefillLabel}` : prefillLabel;
    if (prefillAbsent && !decodeAbsent) return dw > 1 ? `${dw}x${decodeLabel}` : decodeLabel;
    return `${pw}x${prefillLabel}+${dw}x${decodeLabel}`;
  }

  const segment = configSegmentLabel(
    f.tp,
    f.ep,
    f.dpAttention,
    f.pp,
    f.dcp,
    f.pcp,
    f.dp,
    f.prefillDwdp,
  );
  return f.prefillDwdp && f.prefillDwdp > 1 && f.prefillNumWorkers && f.prefillNumWorkers > 1
    ? `${f.prefillNumWorkers}x${segment}`
    : segment;
};
