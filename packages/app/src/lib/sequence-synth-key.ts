/**
 * Helpers for promoting per-sequence benchmark rows to first-class
 * "ingested-style" series so a user can compare e.g. 1K/1K vs 8K/1K on the
 * same scatter chart instead of having to flip between them with the picker.
 *
 * Each (origHwKey, sequence) pair becomes a synth hwKey of the form
 *   `${origHwKey}__seq<compact>`
 * — preserving `hwKey.split('_')[0]` (the base GPU) so `getModelSortIndex`,
 * `isKnownGpu`, and the vendor-color generator keep working. The `__seq`
 * delimiter is also distinct from the `__uorun` delimiter used by
 * unofficial-merge so the two can compose (`base__seq1k1k__uorun123`).
 */
import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import type { HardwareEntry } from '@/lib/constants';
import { Sequence, getSequenceLabel } from '@/lib/data-mappings';

const SEQ_SYNTH_DELIM = '__seq';

const SEQUENCE_COMPACT: Record<Sequence, string> = {
  [Sequence.OneK_OneK]: '1k1k',
  [Sequence.OneK_EightK]: '1k8k',
  [Sequence.EightK_OneK]: '8k1k',
  [Sequence.EightK_256]: '8k256',
  [Sequence.EightK_625]: '8k625',
};

const COMPACT_TO_SEQUENCE: Record<string, Sequence> = Object.fromEntries(
  (Object.entries(SEQUENCE_COMPACT) as [Sequence, string][]).map(([s, c]) => [c, s]),
);

/** Compact form for use as a URL/hwKey suffix (e.g. `1k1k`). */
export function sequenceCompact(seq: Sequence): string {
  return SEQUENCE_COMPACT[seq] ?? String(seq).replace('/', '');
}

/** Build a (hw, sequence) synth hwKey while keeping the original GPU base prefix. */
export function makeSeqSynthKey(origHwKey: string, seq: Sequence): string {
  return `${origHwKey}${SEQ_SYNTH_DELIM}${sequenceCompact(seq)}`;
}

/** Reverse {@link makeSeqSynthKey}; returns null when the key has no sequence suffix. */
export function parseSeqSynthKey(hwKey: string): { origHwKey: string; sequence: Sequence } | null {
  const idx = hwKey.indexOf(SEQ_SYNTH_DELIM);
  if (idx === -1) return null;
  const origHwKey = hwKey.slice(0, idx);
  // A trailing `__uorun<id>` may follow the sequence compact form — strip it.
  const rest = hwKey.slice(idx + SEQ_SYNTH_DELIM.length);
  const compact = rest.split('__')[0];
  const sequence = COMPACT_TO_SEQUENCE[compact];
  if (!sequence) return null;
  return { origHwKey, sequence };
}

export function isSeqSynthKey(hwKey: string): boolean {
  return hwKey.includes(SEQ_SYNTH_DELIM);
}

/**
 * Strip a `__seq<compact>` suffix from a hwKey, returning the original key.
 * No-op if the suffix is absent. Used by color resolution / sort helpers that
 * already operate on the base hwKey via `split('_')[0]` but also want the
 * fully-qualified original (e.g. for matching the official `hardwareConfig`).
 */
export function stripSeqSuffix(hwKey: string): string {
  const idx = hwKey.indexOf(SEQ_SYNTH_DELIM);
  if (idx === -1) return hwKey;
  return hwKey.slice(0, idx);
}

/**
 * Build a synthesized HardwareEntry whose label is appended with the
 * sequence label (e.g. "B200 — 1K/1K"). The base entry's other fields are
 * preserved so downstream code (legend swatches, tooltip GPU string, etc.)
 * keeps working.
 */
export function makeSeqSynthHardwareEntry(
  origEntry: HardwareEntry | undefined,
  origHwKey: string,
  seq: Sequence,
  synthHwKey: string,
): HardwareEntry {
  const baseLabel = origEntry?.label ?? origHwKey;
  const seqLabel = getSequenceLabel(seq);
  return {
    name: synthHwKey.replaceAll('_', '-'),
    label: `${baseLabel} — ${seqLabel}`,
    suffix: origEntry?.suffix ?? '',
    gpu: origEntry?.gpu ? `${origEntry.gpu} [${seqLabel}]` : `[${seqLabel}]`,
    framework: origEntry?.framework,
  };
}

/** Build a stable ISL/OSL filter predicate for one sequence. */
export function makeSequenceFilter(
  seq: Sequence,
): ((r: { isl: number; osl: number }) => boolean) | null {
  const islOsl = sequenceToIslOsl(seq);
  if (!islOsl) return null;
  return (r) => r.isl === islOsl.isl && r.osl === islOsl.osl;
}
