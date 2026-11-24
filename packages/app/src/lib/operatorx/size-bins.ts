/** Bins per doubling of the size axis. */
const BINS_PER_OCTAVE = 2;

/** Unrounded size bin of a token count, for placing ticks on a token axis. */
export const tokenBin = (tokens: number) => Math.log2(tokens) * BINS_PER_OCTAVE;

/** Size bin of a token count (GEMM M, MoE tokens): half-octaves. */
export function sizeBin(tokens: number): number {
  return Math.round(tokenBin(tokens));
}

/** Representative token count of a bin. */
export function binTokens(bin: number): number {
  return Math.round(2 ** (bin / BINS_PER_OCTAVE));
}
