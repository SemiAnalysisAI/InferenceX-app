import { computeToggle } from '@/hooks/useTogglableSet';

/**
 * MTP engine-family exclusion rules.
 *
 * Some models (currently dsv4) cannot show MTP configs from different engine
 * families simultaneously, since their acceptance-rate forcing implementations
 * differ and the numbers aren't directly comparable. This module contains the
 * pure helpers that identify families and resolve exclusion decisions; the
 * provider/UI wires them up.
 */

/**
 * If `hwKey` is an MTP config (ends in `_mtp`), return its base engine family
 * (`vllm`, `sglang`, `trt`, etc.) by stripping the GPU prefix and any
 * `dynamo-` / `mori-` engine-family prefix from the framework segment.
 * Returns null for non-MTP keys.
 */
export function getMtpEngineFamily(hwKey: string): string | null {
  if (!hwKey.endsWith('_mtp')) return null;
  const withoutMtp = hwKey.slice(0, -'_mtp'.length);
  const firstUnderscore = withoutMtp.indexOf('_');
  if (firstUnderscore === -1) return null;
  let framework = withoutMtp.slice(firstUnderscore + 1);
  for (const prefix of ['dynamo-', 'mori-']) {
    if (framework.startsWith(prefix)) {
      framework = framework.slice(prefix.length);
      break;
    }
  }
  return framework || null;
}

function groupMtpKeysByFamily(keys: Iterable<string>): Map<string, string[]> {
  const byFamily = new Map<string, string[]>();
  for (const key of keys) {
    const fam = getMtpEngineFamily(key);
    if (!fam) continue;
    const existing = byFamily.get(fam);
    if (existing) existing.push(key);
    else byFamily.set(fam, [key]);
  }
  return byFamily;
}

/**
 * Pick a single MTP engine family to keep when `proposed` contains keys from
 * multiple families. Sticks to the family already present in `prev`; otherwise
 * falls back to the alphabetically-first family. Drops other families' MTP keys.
 *
 * If `proposed` has 0 or 1 MTP families, the input set is returned unchanged.
 */
export function pickStickyMtpFamily(
  proposed: Set<string>,
  prev: Set<string>,
): { result: Set<string>; keptFamily: string | null; droppedFamilies: string[] } {
  const mtpByFamily = groupMtpKeysByFamily(proposed);
  if (mtpByFamily.size <= 1) {
    return {
      result: proposed,
      keptFamily: mtpByFamily.size === 1 ? [...mtpByFamily.keys()][0] : null,
      droppedFamilies: [],
    };
  }
  const prevFamilies = new Set<string>();
  for (const key of prev) {
    const fam = getMtpEngineFamily(key);
    if (fam) prevFamilies.add(fam);
  }
  const families = [...mtpByFamily.keys()];
  const sticky = families.find((f) => prevFamilies.has(f));
  const winner = sticky ?? [...families].toSorted()[0];
  const result = new Set(proposed);
  const dropped: string[] = [];
  for (const [fam, keys] of mtpByFamily) {
    if (fam === winner) continue;
    for (const k of keys) result.delete(k);
    dropped.push(fam);
  }
  return { result, keptFamily: winner, droppedFamilies: dropped };
}

/**
 * Drop MTP keys for ALL families when `proposed` contains keys from more than
 * one family. Used for auto-reset / select-all paths so the user has to opt
 * into MTP explicitly (and only one engine at a time).
 *
 * If `proposed` has 0 or 1 MTP families, the input set is returned unchanged.
 */
export function clearAllMtpFamilies(proposed: Set<string>): {
  result: Set<string>;
  droppedFamilies: string[];
} {
  const mtpByFamily = groupMtpKeysByFamily(proposed);
  if (mtpByFamily.size <= 1) {
    return { result: proposed, droppedFamilies: [] };
  }
  const result = new Set(proposed);
  for (const keys of mtpByFamily.values()) {
    for (const k of keys) result.delete(k);
  }
  return { result, droppedFamilies: [...mtpByFamily.keys()] };
}

/**
 * Decision for a single hw-toggle action under the MTP engine-exclusion rule.
 *
 *  - `block`: the user explicitly tried to add a key whose family conflicts
 *    with the family already active. The provider should refuse the toggle
 *    (no state change) and surface a toast.
 *  - `silent-disable-all`: the toggle would surface multiple MTP families
 *    (e.g. via solo→restore-all). Replace the active set with `result` and
 *    don't show a toast — the user didn't explicitly try to add anything.
 *  - `fallthrough`: the toggle is fine, run the normal toggle path.
 */
export type MtpToggleDecision =
  | { kind: 'block'; attempted: string; existing: string | null }
  | { kind: 'silent-disable-all'; result: Set<string> }
  | { kind: 'fallthrough' };

export function resolveMtpToggle(
  prev: Set<string>,
  hw: string,
  allItems: Set<string>,
): MtpToggleDecision {
  const proposed = computeToggle(prev, hw, allItems);
  const wasActive = prev.has(hw);
  const willBeActive = proposed.has(hw);
  const newFamily = getMtpEngineFamily(hw);

  // Hard-block the explicit ADD that introduces a cross-family MTP conflict.
  if (!wasActive && willBeActive && newFamily) {
    const sticky = pickStickyMtpFamily(proposed, prev);
    if (sticky.droppedFamilies.length > 0 && sticky.keptFamily !== newFamily) {
      return { kind: 'block', attempted: newFamily, existing: sticky.keptFamily };
    }
  }

  // Other paths (e.g. solo→restore-all surfacing a hidden second family) —
  // disable both MTP families silently.
  const cleared = clearAllMtpFamilies(proposed);
  if (cleared.droppedFamilies.length > 0) {
    return { kind: 'silent-disable-all', result: cleared.result };
  }

  return { kind: 'fallthrough' };
}
