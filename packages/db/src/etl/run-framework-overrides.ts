/**
 * Audited run framework reassignments.
 *
 * Kept separate from run-overrides.ts because the benchmark and eval mappers
 * apply these at mapping time, and the app bundles those mappers for the
 * unofficial-run route. This module therefore imports nothing but constants.
 */

import { FRAMEWORK_KEYS, resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

/**
 * A run whose artifacts declare one framework while the sweep actually served
 * another. The mappers substitute `to` for `from` before any config is resolved,
 * so benchmark rows, eval rows, availability, and changelog config keys all land
 * in the corrected framework on every ingest path (CI, GCS backup, re-ingest).
 * `apply-overrides` moves rows that an earlier ingest stored under `from`.
 *
 * Benchmark point backfills and purges for the same run must name the corrected
 * framework in their selectors, because they match the post-override config.
 */
export interface RunFrameworkOverride {
  /** Stable kebab-case identifier shared with the other audited corrections. */
  id: string;
  /** Why the declared framework is wrong for this run. */
  reason: string;
  githubRunId: number;
  /** Canonical framework the artifacts declare, after alias normalization. */
  from: string;
  /** Canonical framework the run actually served; must be a registered framework key. */
  to: string;
}

export const RUN_FRAMEWORK_OVERRIDES: readonly RunFrameworkOverride[] = [
  {
    id: 'run-40744397059-llmd-vllm-router',
    reason:
      'InferenceX-Private-TPU PR #57 ran every Qwen3.5 FP8 TPU v7 AgentX xPyD point behind the llm-d router (Envoy, the endpoint picker, and a routing sidecar in front of each decode engine), but the google-master entry qwen3.5-fp8-tpuv7-vllm-agentic-xpyd-mtp declares framework vllm, so the artifacts grouped the points with plain vLLM. The GB200 llm-d sweeps declare llmd-vllm; this run belongs in the same framework category.',
    githubRunId: 40744397059,
    from: 'vllm',
    to: 'llmd-vllm',
  },
];

/**
 * Validate the registry. `ids` is the shared stable-ID namespace of every audited
 * correction; `purgedRuns` rejects overrides for runs that are deleted on ingest.
 */
export function validateRunFrameworkOverrides(
  overrides: readonly RunFrameworkOverride[],
  ids: Set<string>,
  purgedRuns: ReadonlySet<number>,
): void {
  const selectors = new Set<string>();
  for (const override of overrides) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(override.id)) {
      throw new Error(`${override.id || '<empty>'}: id must be lowercase kebab-case`);
    }
    if (ids.has(override.id)) throw new Error(`duplicate backfill id: ${override.id}`);
    ids.add(override.id);
    if (override.reason.trim().length === 0) {
      throw new Error(`${override.id}: reason must not be empty`);
    }
    if (!Number.isInteger(override.githubRunId) || override.githubRunId <= 0) {
      throw new Error(`${override.id}: githubRunId must be a positive integer`);
    }
    if (purgedRuns.has(override.githubRunId)) {
      throw new Error(`${override.id}: run is already in PURGED_RUNS`);
    }
    for (const [label, value] of Object.entries({ from: override.from, to: override.to })) {
      if (value.length === 0 || value !== value.toLowerCase()) {
        throw new Error(`${override.id}: ${label} must be a non-empty lowercase framework key`);
      }
      if (resolveFrameworkAlias(value) !== value) {
        throw new Error(`${override.id}: ${label} must be the canonical framework, not an alias`);
      }
    }
    if (override.from === override.to) {
      throw new Error(`${override.id}: from and to must differ`);
    }
    if (!FRAMEWORK_KEYS.has(override.to)) {
      throw new Error(`${override.id}: to must be a registered framework key`);
    }
    const selector = `${override.githubRunId}:${override.from}`;
    if (selectors.has(selector)) {
      throw new Error(`${override.id}: duplicate framework override for run ${selector}`);
    }
    selectors.add(selector);
  }
}

function parseGithubRunId(runId: number | string | null | undefined): number | null {
  if (runId === null || runId === undefined) return null;
  const value = typeof runId === 'number' ? runId : /^[1-9]\d*$/u.test(runId) ? Number(runId) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function runFrameworkOverrideFor(
  githubRunId: number | string | null | undefined,
  framework: string,
): RunFrameworkOverride | undefined {
  const runId = parseGithubRunId(githubRunId);
  if (runId === null) return undefined;
  return RUN_FRAMEWORK_OVERRIDES.find(
    (override) => override.githubRunId === runId && override.from === framework,
  );
}

/**
 * Substitute the framework a run actually served for the one its artifacts declare.
 * Called by the mappers with the canonical (alias-resolved) artifact framework.
 */
export function resolveRunFramework(
  githubRunId: number | string | null | undefined,
  framework: string,
): { framework: string; overrideId: string | null } {
  const override = runFrameworkOverrideFor(githubRunId, framework);
  return override
    ? { framework: override.to, overrideId: override.id }
    : { framework, overrideId: null };
}

/**
 * Rewrite the framework segment of a changelog config key
 * (`<model>-<precision>-<hardware>-<framework>[-<trailing>...]`). Keys whose
 * framework segment is not exactly `from` are returned unchanged.
 */
export function rewriteConfigKeyFramework(configKey: string, from: string, to: string): string {
  const parts = configKey.split('-');
  if (parts.length < 4 || parts.slice(0, 3).some((part) => part.length === 0)) return configKey;
  const remainder = parts.slice(3).join('-');
  if (remainder !== from && !remainder.startsWith(`${from}-`)) return configKey;
  return `${parts.slice(0, 3).join('-')}-${to}${remainder.slice(from.length)}`;
}

interface FrameworkRewritableChangelog<T extends { configKeys: string[] }> {
  entries: T[];
}

/**
 * Apply every framework override registered for a run to its changelog config
 * keys so the entry keeps matching the corrected hardware series in the UI.
 */
export function applyRunFrameworkOverridesToChangelogs<
  T extends { configKeys: string[] },
  C extends FrameworkRewritableChangelog<T>,
>(githubRunId: number, changelogs: readonly C[]): { changelogs: C[]; overrideIds: string[] } {
  const overrides = RUN_FRAMEWORK_OVERRIDES.filter(
    (override) => override.githubRunId === githubRunId,
  );
  if (overrides.length === 0) return { changelogs: [...changelogs], overrideIds: [] };

  const overrideIds = new Set<string>();
  const corrected = changelogs.map((changelog) => ({
    ...changelog,
    entries: changelog.entries.map((entry) => {
      const configKeys = entry.configKeys.map((key) => {
        for (const override of overrides) {
          const rewritten = rewriteConfigKeyFramework(key, override.from, override.to);
          if (rewritten !== key) {
            overrideIds.add(override.id);
            return rewritten;
          }
        }
        return key;
      });
      return { ...entry, configKeys };
    }),
  }));
  return { changelogs: corrected, overrideIds: [...overrideIds] };
}
