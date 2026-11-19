/**
 * The speculative decoding algorithm and draft model a benchmark's server actually ran, read
 * from its server log in the vocabulary InferenceX results use (`spec_algorithm`,
 * `spec_draft_model`). Results written before InferenceX emitted those fields only have the
 * matrix label, which says neither.
 */

export interface ServerLogSpeculation {
  spec_algorithm: string;
  spec_draft_model: string;
}

/**
 * Lines (or line fragments) that state the speculative config, as one Postgres ARE so callers
 * can extract them server-side instead of downloading whole logs.
 */
export const SPECULATION_LOG_PATTERN = [
  String.raw`SpeculativeConfig\([^)]*\)`,
  String.raw`'speculative_algorithm': '[^']*'`,
  String.raw`speculative_algorithm='[^']*'`,
  String.raw`'speculative_draft_model_path': '[^']*'`,
  String.raw`speculative_draft_model_path='[^']*'`,
  String.raw`'decoding_type': '[^']*'`,
  String.raw`decoding_type='[^']*'`,
  String.raw`'speculative_model': '[^']*'`,
  String.raw`speculative_model=PosixPath\('[^']*'\)`,
  String.raw`speculative_model='[^']*'`,
  String.raw`draft model loaded from [^ \n]+`,
  String.raw`Loading safetensors shards\[[^]\n]+\]`,
  String.raw`num_mtp [0-9]+`,
].join('|');

// Engines often name the served checkpoint (or a directory inside it) as the draft model; only
// a separate drafter's name says it drafts.
const SEPARATE_DRAFTER = /dspark|dflash|eagle|nextn|mtp|draft/iu;
// Separate drafters servers loaded from a local copy, by lowercase directory name.
const DRAFTER_REPOS: Readonly<Record<string, string>> = {
  'kimi-k3-dspark': 'Inferact/Kimi-K3-DSpark',
  'inferact-kimi-k3-dspark': 'Inferact/Kimi-K3-DSpark',
  'minimax-m3-eagle3': 'Inferact/MiniMax-M3-EAGLE3',
  'minimax-m3-eagle3-gqa': 'Inferact/MiniMax-M3-EAGLE3-GQA',
  'muse-spark-open-dflash2': 'RadixArk/Muse-Spark-Open-DFlash2',
  'deepseek-r1-nextn': 'SGLang/DeepSeek-R1-NextN',
};

const HF_CACHE_REPO = /models--(?<org>[^/]+)--(?<name>[^/]+)/u;
const REPO_ID = /^[\w.-]+\/[\w.-]+$/u;

function firstCapture(text: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}gu`))) {
      const value = match.groups?.v;
      if (value && value !== 'None') return value;
    }
  }
  return undefined;
}

function normalizeAlgorithm(modelPrefix: string, method: string): string {
  const lower = method.toLowerCase();
  if (lower === 'eagle' || lower === 'nextn') return modelPrefix === 'minimaxm3' ? 'eagle3' : 'mtp';
  return lower;
}

function drafterName(path: string): string {
  const cached = HF_CACHE_REPO.exec(path);
  if (cached?.groups) return `${cached.groups.org}/${cached.groups.name}`;
  if (REPO_ID.test(path) && !path.startsWith('/')) return path;
  const base = path.replace(/\/+$/u, '').split('/').pop() ?? path;
  return DRAFTER_REPOS[base.toLowerCase()] ?? base;
}

export function speculationFromServerLog(
  text: string,
  modelPrefix: string,
): ServerLogSpeculation | null {
  const method =
    firstCapture(text, [
      /SpeculativeConfig\(method='(?<v>[^']+)'/,
      /'speculative_algorithm': '(?<v>[^']+)'/,
      /speculative_algorithm='(?<v>[^']+)'/,
      /'decoding_type': '(?<v>[^']+)'/,
      /decoding_type='(?<v>[^']+)'/,
    ]) ?? (/num_mtp [1-9]/u.test(text) ? 'mtp' : undefined);
  if (!method) return null;

  const draft = firstCapture(text, [
    /SpeculativeConfig\([^)]*model='(?<v>[^']+)'/,
    /'speculative_draft_model_path': '(?<v>[^']+)'/,
    /speculative_draft_model_path='(?<v>[^']+)'/,
    /'speculative_model': '(?<v>[^']+)'/,
    /speculative_model=PosixPath\('(?<v>[^']+)'\)/,
    /speculative_model='(?<v>[^']+)'/,
    /draft model loaded from (?<v>[^ \n]+)/,
    /Loading safetensors shards\[(?<v>[^\]]*(?:dspark|dflash|eagle|nextn|mtp|draft)[^\]]*)\]/i,
  ]);
  // Recipes mount the served checkpoint at /model; a drafter inside it ships with the model.
  const name =
    draft === undefined || /^\/model(?:\/|$)/u.test(draft) ? undefined : drafterName(draft);
  return {
    spec_algorithm: normalizeAlgorithm(modelPrefix, method),
    spec_draft_model:
      name === undefined || !SEPARATE_DRAFTER.test(name.split('/').pop() ?? name) ? 'native' : name,
  };
}
