export interface PrecisionEntry {
  label: string;
  /** Vendor-specific names benchmark artifacts report for this precision. */
  aliases?: readonly string[];
}

const PRECISIONS = {
  fp4: { label: 'FP4', aliases: ['nvfp4', 'mxfp4'] },
  fp4fp8: { label: 'FP4+FP8' },
  fp8: { label: 'FP8' },
  bf16: { label: 'BF16' },
  int4: { label: 'INT4' },
} as const satisfies Record<string, PrecisionEntry>;

export type PrecisionKey = keyof typeof PRECISIONS;

/** Every precision, keyed by its stored value, in selector order. */
export const PRECISION_REGISTRY: Record<PrecisionKey, PrecisionEntry> = PRECISIONS;

export const PRECISION_KEYS = new Set<string>(Object.keys(PRECISIONS));

export const PRECISION_ALIASES: Record<string, PrecisionKey> = Object.fromEntries(
  (Object.keys(PRECISIONS) as PrecisionKey[]).flatMap((key) =>
    (PRECISION_REGISTRY[key].aliases ?? []).map((alias) => [alias, key]),
  ),
);
