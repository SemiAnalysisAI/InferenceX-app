import { SPEC_METHOD_KEYS } from '@semianalysisai/inferencex-constants';

import { computeToggle } from '@/lib/toggle-set';

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
  /**
   * Restrict mutual exclusion to configs on the same hardware SKU. Different
   * hardware may use different engine groups on the same graph.
   */
  scope?: 'hardware';
}

/** Compiled resolvers for model- or sequence-scoped exclusion specs. */
export interface Exclusion {
  /** Literal engine family of a participating key (for display), else null. */
  familyOf: (hwKey: string) => string | null;
  /** Comparability-group id of a participating key (for exclusion), else null. */
  groupOf: (hwKey: string) => string | null;
  /** Mutual-exclusion scopes of a participating key. Empty when it does not participate. */
  scopesOf: (hwKey: string) => readonly string[];
}

const ACTIVE_SPEC_SUFFIXES = [...SPEC_METHOD_KEYS]
  .filter((method) => method !== 'none')
  .map((method) => `_${method}`);

const GLOBAL_SCOPE = '*';

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
 * Compile a list of `ExclusionSpec`s into family, group, and scope resolvers.
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
    scopesOf(hwKey: string): readonly string[] {
      for (const spec of specs) {
        const fam = familyForSpec(hwKey, spec);
        if (!fam) continue;
        const firstUnderscore = hwKey.indexOf('_');
        const hardwareScope =
          firstUnderscore === -1 ? GLOBAL_SCOPE : hwKey.slice(0, firstUnderscore);
        return spec.scope === 'hardware' ? [hardwareScope] : [GLOBAL_SCOPE, hardwareScope];
      }
      return [];
    },
  };
}

function groupKeysByScope(
  keys: Iterable<string>,
  ex: Exclusion,
): Map<string, Map<string, string[]>> {
  const byScope = new Map<string, Map<string, string[]>>();
  for (const key of keys) {
    const group = ex.groupOf(key);
    if (!group) continue;
    for (const scope of ex.scopesOf(key)) {
      let byGroup = byScope.get(scope);
      if (!byGroup) {
        byGroup = new Map();
        byScope.set(scope, byGroup);
      }
      const existing = byGroup.get(group);
      if (existing) existing.push(key);
      else byGroup.set(group, [key]);
    }
  }
  return byScope;
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
  group: string,
  scope: string,
  ex: Exclusion,
): string | null {
  const families: string[] = [];
  for (const key of keys) {
    const fam = ex.familyOf(key);
    if (fam && ex.groupOf(key) === group && ex.scopesOf(key).includes(scope)) families.push(fam);
  }
  return families.length > 0 ? families.toSorted()[0] : null;
}

/**
 * Pick a single comparability group to keep when `proposed` contains keys from
 * multiple groups. Sticks to a group already present in `prev`; for a shared
 * scope with no direct prior key (for example the global MTP scope), also honors
 * a prior key from the same group on an overlapping hardware scope. Otherwise
 * falls back to the alphabetically-first group.
 *
 * If `proposed` has 0 or 1 groups, the input set is returned unchanged.
 */
export function pickStickyGroup(
  proposed: Set<string>,
  prev: Set<string>,
  ex: Exclusion,
): { result: Set<string>; keptGroup: string | null; droppedGroups: string[] } {
  const byScope = groupKeysByScope(proposed, ex);
  const allGroups = new Set([...byScope.values()].flatMap((byGroup) => [...byGroup.keys()]));
  const result = new Set(proposed);
  const winners = new Set<string>();
  const dropped = new Set<string>();

  for (const [scope, byGroup] of byScope) {
    if (byGroup.size <= 1) continue;
    const directPrevGroups = new Set<string>();
    for (const key of prev) {
      if (!ex.scopesOf(key).includes(scope)) continue;
      const group = ex.groupOf(key);
      if (group) directPrevGroups.add(group);
    }
    const groups = [...byGroup.keys()];
    const correlatedPrevGroups = new Set<string>();
    if (directPrevGroups.size === 0) {
      for (const [group, keys] of byGroup) {
        const relatedScopes = new Set(
          [...keys].flatMap((key) => ex.scopesOf(key).filter((candidate) => candidate !== scope)),
        );
        if (
          [...prev].some(
            (key) =>
              ex.groupOf(key) === group &&
              ex.scopesOf(key).some((candidate) => relatedScopes.has(candidate)),
          )
        ) {
          correlatedPrevGroups.add(group);
        }
      }
    }
    const winner =
      groups.filter((group) => directPrevGroups.has(group)).toSorted()[0] ??
      groups.filter((group) => correlatedPrevGroups.has(group)).toSorted()[0] ??
      groups.toSorted()[0];
    winners.add(winner);
    for (const [group, keys] of byGroup) {
      if (group === winner) continue;
      for (const key of keys) result.delete(key);
      dropped.add(group);
    }
  }

  return {
    result: dropped.size === 0 ? proposed : result,
    keptGroup:
      winners.size === 1
        ? [...winners][0]
        : winners.size === 0 && allGroups.size === 1
          ? [...allGroups][0]
          : null,
    droppedGroups: [...dropped],
  };
}

/**
 * Compute the effective legend universe for solo/restore-all toggle semantics
 * under exclusion. Participating keys whose group is not active or remembered
 * for one of their scopes are dropped. Remembered groups preserve each
 * hardware's selection while it is temporarily absent in solo mode; an idle
 * global scope without a remembered selection remains excluded so default-
 * deselected variants (e.g. DSv4 MTP) still count as deselected.
 */
export function effectiveLegendItems(
  allItems: Set<string>,
  active: Set<string>,
  ex: Exclusion,
  preferred: Set<string> = active,
): Set<string> {
  const activeGroupsByScope = new Map<string, Set<string>>();
  for (const key of active) {
    const group = ex.groupOf(key);
    if (!group) continue;
    for (const scope of ex.scopesOf(key)) {
      const groups = activeGroupsByScope.get(scope);
      if (groups) groups.add(group);
      else activeGroupsByScope.set(scope, new Set([group]));
    }
  }
  const preferredGroupsByScope = new Map<string, Set<string>>();
  for (const key of preferred) {
    const group = ex.groupOf(key);
    if (!group) continue;
    for (const scope of ex.scopesOf(key)) {
      const groups = preferredGroupsByScope.get(scope);
      if (groups) groups.add(group);
      else preferredGroupsByScope.set(scope, new Set([group]));
    }
  }
  const result = new Set<string>();
  for (const key of allItems) {
    const group = ex.groupOf(key);
    const scopes = ex.scopesOf(key);
    const effectiveScopeGroups = scopes
      .map((scope) => activeGroupsByScope.get(scope) ?? preferredGroupsByScope.get(scope))
      .filter((groups): groups is Set<string> => groups !== undefined);
    const idleGlobalScope =
      scopes.includes(GLOBAL_SCOPE) &&
      !activeGroupsByScope.has(GLOBAL_SCOPE) &&
      !preferredGroupsByScope.has(GLOBAL_SCOPE);
    if (!group || (!idleGlobalScope && effectiveScopeGroups.every((groups) => groups.has(group)))) {
      result.add(key);
    }
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
  const byScope = groupKeysByScope(proposed, ex);
  const result = new Set(proposed);
  const dropped = new Set<string>();
  for (const byGroup of byScope.values()) {
    if (byGroup.size <= 1) continue;
    for (const [group, keys] of byGroup) {
      for (const key of keys) result.delete(key);
      dropped.add(group);
    }
  }
  return {
    result: dropped.size === 0 ? proposed : result,
    droppedGroups: [...dropped],
  };
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

/** Engine families wholly retained, wholly removed, or retained only on other scopes. */
export function exclusionResolutionFamilies(
  proposed: Iterable<string>,
  result: ReadonlySet<string>,
  ex: Exclusion,
): { kept: string[]; dropped: string[]; partial: string[] } {
  const kept = new Set<string>();
  const dropped = new Set<string>();
  for (const key of proposed) {
    const family = ex.familyOf(key);
    if (!family) continue;
    (result.has(key) ? kept : dropped).add(family);
  }
  const partial = new Set([...kept].filter((family) => dropped.has(family)));
  for (const family of partial) {
    kept.delete(family);
    dropped.delete(family);
  }
  return {
    kept: [...kept].toSorted(),
    dropped: [...dropped].toSorted(),
    partial: [...partial].toSorted(),
  };
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
  const newScopes = ex.scopesOf(hw);

  // Hard-block only an explicit add that introduces a second group in an
  // overlapping exclusion scope. Global rules also participate in their
  // hardware scope, preserving same-SKU STP/MTP conflicts.
  if (!wasActive && willBeActive && newGroup && newScopes.length > 0) {
    for (const newScope of newScopes) {
      const existingGroup = [...prev]
        .filter((key) => ex.scopesOf(key).includes(newScope))
        .map((key) => ex.groupOf(key))
        .find((group) => group !== null && group !== newGroup);
      if (!existingGroup) continue;
      const existing = activeFamilyInGroup(prev, existingGroup, newScope, ex) ?? existingGroup;
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
