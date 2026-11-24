import { DB_MODEL_TO_DISPLAY, DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';

export interface ResolvedModel {
  /** Canonical display name, e.g. `DeepSeek-V4-Pro`. */
  readonly displayName: string;
  /** Every DB model key behind the display name. */
  readonly dbModelKeys: readonly string[];
}

/** Canonical `model=` vocabulary: the display names, sorted. */
export const MODEL_DISPLAY_NAMES: readonly string[] = Object.keys(DISPLAY_MODEL_TO_DB).toSorted();

/**
 * Retired or misspelled names that API clients still send, each naming exactly one current display
 * model. Names that could mean more than one model (for example `Qwen3.8`) stay unknown.
 */
export const LEGACY_MODEL_NAMES: Readonly<Record<string, string>> = {
  // The display name has a hyphen after Qwen; the model card does not.
  'Qwen3.5-397B-A17B': 'Qwen-3.5-397B-A17B',
  // The dashboard label carries the checkpoint date.
  'DeepSeek-V4-Pro-0813': 'DeepSeek-V4-Pro',
  // Point releases that share a display bucket with an earlier name.
  'Kimi-K2.6': 'Kimi-K2.5',
  'Kimi-K2.7-Code': 'Kimi-K2.5',
  'MiniMax-M2.7': 'MiniMax-M2.5',
  'GLM-5.1': 'GLM-5',
  'GLM-5.3': 'GLM-5.2',
  'Kimi-K3.1': 'Kimi-K3.1-Pro',
  'Llama-3.3-70B-Instruct': 'Llama-3.3-70B-Instruct-FP8',
};

function lowercaseIndex(entries: Iterable<readonly [string, string]>): Map<string, string> {
  return new Map([...entries].map(([name, displayName]) => [name.toLowerCase(), displayName]));
}

const DISPLAY_BY_NAME = lowercaseIndex(MODEL_DISPLAY_NAMES.map((name) => [name, name]));
const DISPLAY_BY_LEGACY_NAME = lowercaseIndex(Object.entries(LEGACY_MODEL_NAMES));
const DISPLAY_BY_DB_KEY = lowercaseIndex(Object.entries(DB_MODEL_TO_DISPLAY));
const DISPLAY_BY_SLUG = new Map(
  COMPARE_MODEL_SLUGS.map((entry) => [entry.slug, entry.displayName] as const),
);
/** Every dashboard slug alias, including family names such as `deepseek` that pick one model. */
const SLUG_BY_ALIAS = new Map(Object.entries(COMPARE_MODEL_ALIASES));

const compactName = (name: string) => name.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');

/**
 * The slug aliases that name a single current model. A family alias such as `deepseek`, `kimi`,
 * `qwen`, `glm` or `minimax` prefixes several display names, so it is ambiguous; `llama` and
 * `gptoss` prefix one and stay.
 */
const SLUG_BY_SPECIFIC_ALIAS = new Map(
  [...SLUG_BY_ALIAS].filter(
    ([alias]) =>
      MODEL_DISPLAY_NAMES.filter((name) => compactName(name).startsWith(compactName(alias)))
        .length <= 1,
  ),
);

export interface ResolveModelNameOptions {
  /**
   * Also accept family aliases (`deepseek` → DeepSeek-R1-0528), which the views API has always
   * resolved for compare-page compatibility. Raw benchmark reads reject them as ambiguous.
   */
  familyAliases?: boolean;
}

/**
 * Resolves a `model=` value to its display model, or null when unknown or ambiguous. Accepts,
 * case-insensitively, the display name, a legacy name from {@link LEGACY_MODEL_NAMES}, a DB model
 * key (`dsv4`, `kimik3.1`), or a dashboard slug or single-model slug alias (`kimi-k31-pro`,
 * `minimax-m25`). A DB key selects its whole display model, like the dashboard; rows keep their own
 * `model` key.
 */
export function resolveModelName(
  value: string,
  { familyAliases = false }: ResolveModelNameOptions = {},
): ResolvedModel | null {
  const name = value.trim().toLowerCase();
  const aliases = familyAliases ? SLUG_BY_ALIAS : SLUG_BY_SPECIFIC_ALIAS;
  const displayName =
    DISPLAY_BY_NAME.get(name) ??
    DISPLAY_BY_LEGACY_NAME.get(name) ??
    DISPLAY_BY_DB_KEY.get(name) ??
    DISPLAY_BY_SLUG.get(aliases.get(name) ?? name);
  const dbModelKeys = displayName ? DISPLAY_MODEL_TO_DB[displayName] : undefined;
  return displayName && dbModelKeys?.length ? { displayName, dbModelKeys } : null;
}
