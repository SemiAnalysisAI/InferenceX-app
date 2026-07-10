import { SPEC_METHOD_KEYS } from '@semianalysisai/inferencex-constants';

import { computeToggle } from '@/hooks/useTogglableSet';

/**
 * Data-driven config exclusion.
 *
 * Some models or scenarios can't show certain config variants on the same graph
 * because the numbers aren't directly comparable. DeepSeek V4 MTP configs use
 * engine-specific acceptance forcing; AgentX also keeps standard-token (STP)
 * results from different engines separate while the benchmark is new.
 *
 * Rules are expressed as DATA — `ExclusionSpec[]` values declared by model or
 * sequence in `data-mappings.ts` — then compiled into resolvers by
 * `buildExclusion`. Every helper here operates on a compiled `Exclusion`, so
 * adding an exclusivity rule means adding data, not branching UI code.
 *
 * Participating keys are partitioned into comparability GROUPS. Keys in the
 * same group may be active together; keys in different groups are mutually
 * exclusive — at most one group active at a time. ATOM and SGLang may share a
 * group while vLLM remains separate.
 */

/** Data params defining one exclusion rule. */
export interface ExclusionSpec {
  /**
   * Non-empty hwKey suffix for a variant (for example `_mtp`), or `null` for
   * standard-token configs whose hwKeys have no speculative-method suffix.
   */
  suffix: string | null;
  /**
   * Engine-family prefixes stripped from the framework segment before grouping
   * (e.g. `dynamo-`, `mori-`), so `h100_dynamo-vllm_mtp` resolves to `vllm`.
   */
  stripPrefixes?: string[];
  /**
   * Raw family → shared comparability-group id. Two families can co-exist on a
   * graph iff they resolve to the same group; families omitted here are their
   * own group. (e.g. `{ atom: 'sglang' }` — ATOM and SGLang are comparable.)
   */
  groupAliases?: Record<string, string>;
}

/** Compiled resolvers for model- or sequence-scoped exclusion specs. */
export interface Exclusion {
  /** Literal engine family of a participating key (for display), else null. */
  familyOf: (hwKey: string) => string | null;
  /** Comparability-group id of a participating key (for exclusion), else null. */
  groupOf: (hwKey: string) => string | null;
}

const ACTIVE_SPEC_SUFFIXES = [...SPEC_METHOD_KEYS]
  .filter((method) => method !== 'none')
  .map((method) => `_${method}`);

/**
 * Extract the literal engine family for `hwKey` under a single spec: strip the
 * configured variant suffix (or require an unsuffixed STP key), drop the leading
 * GPU segment, then strip any configured engine-family prefix. Returns null if
 * the key doesn't participate.
 */
function familyForSpec(hwKey: string, spec: ExclusionSpec): string | null {
  let head: string;
  if (spec.suffix === null) {
    if (ACTIVE_SPEC_SUFFIXES.some((suffix) => hwKey.endsWith(suffix))) return null;
    head = hwKey;
  } else {
    if (spec.suffix.length === 0 || !hwKey.endsWith(spec.suffix)) return null;
    head = hwKey.slice(0, -spec.suffix.length);
  }
  const firstUnderscore = head.indexOf('_');
  if (firstUnderscore === -1) return null;
  let framework = head.slice(firstUnderscore + 1);
  for (const prefix of spec.stripPrefixes ?? []) {
    if (framework.startsWith(prefix)) {
      framework = framework.slice(prefix.length);
      break;
    }
  }
  return framework || null;
}

/**
 * Compile a list of `ExclusionSpec`s into `familyOf` / `groupOf` resolvers.
 * The first spec that matches a key wins; variant-specific suffixes and the
 * unsuffixed STP matcher are disjoint.
 */
export function buildExclusion(specs: readonly ExclusionSpec[]): Exclusion {
  return {
    familyOf(hwKey: string): string | null {
      for (const spec of specs) {
        const fam = familyForSpec(hwKey, spec);
        if (fam) return fam;
      }
      return null;
    },
    groupOf(hwKey: string): string | null {
      for (const spec of specs) {
        const fam = familyForSpec(hwKey, spec);
        if (fam) return spec.groupAliases?.[fam] ?? fam;
      }
      return null;
    },
  };
}

function groupKeysByGroup(keys: Iterable<string>, ex: Exclusion): Map<string, string[]> {
  const byGroup = new Map<string, string[]>();
  for (const key of keys) {
    const group = ex.groupOf(key);
    if (!group) continue;
    const existing = byGroup.get(group);
    if (existing) existing.push(key);
    else byGroup.set(group, [key]);
  }
  return byGroup;
}

/**
 * Find the literal engine family of an active participating key in `keys` that
 * belongs to comparability group `group`. Used to label conflict messaging with
 * the real active engine (e.g. "ATOM") rather than the group id (e.g. "sglang").
 * When several comparable engines are active, returns the alphabetically-first
 * for a stable message. Returns null if none match.
 */
function activeFamilyInGroup(
  keys: Iterable<string>,
  group: string | null,
  ex: Exclusion,
): string | null {
  if (!group) return null;
  const families: string[] = [];
  for (const key of keys) {
    const fam = ex.familyOf(key);
    if (fam && ex.groupOf(key) === group) families.push(fam);
  }
  return families.length > 0 ? families.toSorted()[0] : null;
}

/**
 * Pick a single comparability group to keep when `proposed` contains keys from
 * multiple groups. Sticks to a group already present in `prev`; otherwise falls
 * back to the alphabetically-first group. Drops other groups' participating keys.
 *
 * If `proposed` has 0 or 1 groups, the input set is returned unchanged.
 */
export function pickStickyGroup(
  proposed: Set<string>,
  prev: Set<string>,
  ex: Exclusion,
): { result: Set<string>; keptGroup: string | null; droppedGroups: string[] } {
  const byGroup = groupKeysByGroup(proposed, ex);
  if (byGroup.size <= 1) {
    return {
      result: proposed,
      keptGroup: byGroup.size === 1 ? [...byGroup.keys()][0] : null,
      droppedGroups: [],
    };
  }
  const prevGroups = new Set<string>();
  for (const key of prev) {
    const group = ex.groupOf(key);
    if (group) prevGroups.add(group);
  }
  const groups = [...byGroup.keys()];
  const sticky = groups.find((g) => prevGroups.has(g));
  const winner = sticky ?? [...groups].toSorted()[0];
  const result = new Set(proposed);
  const dropped: string[] = [];
  for (const [group, keys] of byGroup) {
    if (group === winner) continue;
    for (const k of keys) result.delete(k);
    dropped.push(group);
  }
  return { result, keptGroup: winner, droppedGroups: dropped };
}

/**
 * Compute the effective legend universe for solo/restore-all toggle semantics
 * under exclusion. Participating keys whose group is not currently active are
 * dropped, so the default-deselected state (e.g. DSv4 MTP on first load) counts
 * as "all selected" — clicking an entry then solos it instead of just removing
 * it.
 */
export function effectiveLegendItems(
  allItems: Set<string>,
  active: Set<string>,
  ex: Exclusion,
): Set<string> {
  const activeGroups = new Set<string>();
  for (const k of active) {
    const group = ex.groupOf(k);
    if (group) activeGroups.add(group);
  }
  const result = new Set<string>();
  for (const k of allItems) {
    const group = ex.groupOf(k);
    if (!group || activeGroups.has(group)) result.add(k);
  }
  return result;
}

/**
 * Drop participating keys for ALL groups when `proposed` contains keys from more
 * than one group. Used for auto-reset / select-all paths so the user has to opt
 * into one group explicitly (and only one at a time).
 *
 * If `proposed` has 0 or 1 groups, the input set is returned unchanged.
 */
export function clearAllExclusionGroups(
  proposed: Set<string>,
  ex: Exclusion,
): { result: Set<string>; droppedGroups: string[] } {
  const byGroup = groupKeysByGroup(proposed, ex);
  if (byGroup.size <= 1) {
    return { result: proposed, droppedGroups: [] };
  }
  const result = new Set(proposed);
  for (const keys of byGroup.values()) {
    for (const k of keys) result.delete(k);
  }
  return { result, droppedGroups: [...byGroup.keys()] };
}

export type ExclusionConflictPolicy = 'clear-all' | 'keep-sticky';

export interface ExclusionResolution {
  result: Set<string>;
  keptGroup: string | null;
  droppedGroups: string[];
}

/** Resolve a multi-group set according to the view's default-selection policy. */
export function resolveExclusionGroups(
  proposed: Set<string>,
  prev: Set<string>,
  ex: Exclusion,
  policy: ExclusionConflictPolicy = 'clear-all',
): ExclusionResolution {
  if (policy === 'keep-sticky') return pickStickyGroup(proposed, prev, ex);
  const cleared = clearAllExclusionGroups(proposed, ex);
  return { ...cleared, keptGroup: null };
}

/** Literal engine families retained and removed by an exclusion resolution. */
export function exclusionResolutionFamilies(
  proposed: Iterable<string>,
  result: ReadonlySet<string>,
  ex: Exclusion,
): { kept: string[]; dropped: string[] } {
  const kept = new Set<string>();
  const dropped = new Set<string>();
  for (const key of proposed) {
    const family = ex.familyOf(key);
    if (!family) continue;
    (result.has(key) ? kept : dropped).add(family);
  }
  return { kept: [...kept].toSorted(), dropped: [...dropped].toSorted() };
}

/**
 * Decision for a single hw-toggle action under an exclusion rule.
 *
 *  - `block`: the user explicitly tried to add a key whose group conflicts with
 *    the group already active. The provider should refuse the toggle (no state
 *    change) and surface a toast. `attempted` / `existing` name the literal
 *    engine families for display.
 *  - `silent-resolve`: the toggle would surface multiple groups (e.g. via
 *    solo→restore-all). Replace the active set with the policy-resolved `result`
 *    and don't show a toast — the user didn't explicitly try to add anything.
 *  - `fallthrough`: the toggle is fine, run the normal toggle path.
 */
export type ExclusionToggleDecision =
  | { kind: 'block'; attempted: string; existing: string | null }
  | { kind: 'silent-resolve'; result: Set<string> }
  | { kind: 'fallthrough' };

export function resolveExclusionToggle(
  prev: Set<string>,
  hw: string,
  allItems: Set<string>,
  ex: Exclusion,
  policy: ExclusionConflictPolicy = 'clear-all',
): ExclusionToggleDecision {
  const proposed = computeToggle(prev, hw, allItems);
  const wasActive = prev.has(hw);
  const willBeActive = proposed.has(hw);
  const newFamily = ex.familyOf(hw);
  const newGroup = ex.groupOf(hw);

  // Hard-block the explicit ADD that introduces a cross-group conflict. Compare
  // on the comparability group (so adding an engine in the already-active group,
  // e.g. ATOM alongside SGLang, is allowed), but surface the literal engine
  // label in the toast.
  if (!wasActive && willBeActive && newGroup) {
    const sticky = pickStickyGroup(proposed, prev, ex);
    if (sticky.droppedGroups.length > 0 && sticky.keptGroup !== newGroup) {
      const existing = activeFamilyInGroup(prev, sticky.keptGroup, ex) ?? sticky.keptGroup;
      return { kind: 'block', attempted: newFamily ?? newGroup, existing };
    }
  }

  // Other paths (e.g. solo→restore-all surfacing a hidden second group) are
  // normalized silently because the user didn't explicitly add a conflict.
  const resolved = resolveExclusionGroups(proposed, prev, ex, policy);
  if (resolved.droppedGroups.length > 0) {
    return { kind: 'silent-resolve', result: resolved.result };
  }

  return { kind: 'fallthrough' };
}
