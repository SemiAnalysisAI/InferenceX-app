import { SPEC_METHOD_KEYS } from '@semianalysisai/inferencex-constants';

import { computeToggle } from '@/lib/shared/toggle-set';

export interface ExclusionSpec {
  suffix: string | null;
  stripPrefixes?: string[];
  groupAliases?: Record<string, string>;
  participatingFamilies?: readonly string[];
  scope?: 'hardware';
}

export interface Exclusion {
  familyOf: (hwKey: string) => string | null;
  groupOf: (hwKey: string) => string | null;
  scopesOf: (hwKey: string) => readonly string[];
}

const ACTIVE_SPEC_SUFFIXES = [...SPEC_METHOD_KEYS]
  .filter((method) => method !== 'none')
  .map((method) => `_${method}`);

const GLOBAL_SCOPE = '*';

function groupForFamily(family: string, spec: ExclusionSpec): string {
  return spec.groupAliases?.[family] ?? family;
}

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
  if (!framework) return null;
  if (spec.participatingFamilies && !spec.participatingFamilies.includes(framework)) return null;
  return framework;
}

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
        if (fam) return groupForFamily(fam, spec);
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

export function pickStickyGroup(
  proposed: Set<string>,
  prev: Set<string>,
  ex: Exclusion,
  fallbackGroup?: string | null,
): { result: Set<string>; keptGroup: string | null; droppedGroups: string[] } {
  const byScope = groupKeysByScope(proposed, ex);
  const allGroups = new Set([...byScope.values()].flatMap((byGroup) => [...byGroup.keys()]));
  const result = new Set(proposed);
  const winners = new Set<string>();
  const dropped = new Set<string>();

  const stickyWinner = (candidates: string[]): string | undefined => {
    if (candidates.length <= 1) return candidates[0];
    if (fallbackGroup && candidates.includes(fallbackGroup)) return fallbackGroup;
    return candidates.toSorted()[0];
  };

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
      stickyWinner(groups.filter((group) => directPrevGroups.has(group))) ??
      stickyWinner(groups.filter((group) => correlatedPrevGroups.has(group))) ??
      (fallbackGroup && groups.includes(fallbackGroup) ? fallbackGroup : undefined) ??
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

export function resolveExclusionGroups(
  proposed: Set<string>,
  prev: Set<string>,
  ex: Exclusion,
  policy: ExclusionConflictPolicy = 'clear-all',
  fallbackGroup?: string | null,
): ExclusionResolution {
  if (policy === 'keep-sticky') return pickStickyGroup(proposed, prev, ex, fallbackGroup);
  const cleared = clearAllExclusionGroups(proposed, ex);
  return { ...cleared, keptGroup: null };
}

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
  fallbackGroup?: string | null,
): ExclusionToggleDecision {
  const proposed = computeToggle(prev, hw, allItems);
  const wasActive = prev.has(hw);
  const willBeActive = proposed.has(hw);
  const newFamily = ex.familyOf(hw);
  const newGroup = ex.groupOf(hw);
  const newScopes = ex.scopesOf(hw);

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

  const resolved = resolveExclusionGroups(proposed, prev, ex, policy, fallbackGroup);
  if (resolved.droppedGroups.length > 0) {
    return { kind: 'silent-resolve', result: resolved.result };
  }

  return { kind: 'fallthrough' };
}
