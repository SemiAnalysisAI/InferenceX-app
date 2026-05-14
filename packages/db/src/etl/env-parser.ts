/**
 * Pure parser that extracts environment metadata from a server.log preamble.
 *
 * This is the FALLBACK path for the Reproduce Drawer's Environment tab —
 * authoritative data comes from upstream CI's `env.json` artifact (parsed by
 * `env-json-reader.ts`). The log parser exists so historical rows (and any
 * future run that drops env.json) still surface partial data instead of
 * nothing.
 *
 * Host-level fields (driver / CUDA / GPU SKU / framework SHA) are NEVER
 * filled from logs — no current framework prints `nvidia-smi`/`rocm-smi` or
 * `git rev-parse` output. The parser returns `null` for them so the
 * downstream UI can render `(not recorded)` until env.json is available.
 *
 * The function is pure and synchronous; framework-keyed regexes live in the
 * `FRAMEWORK_VERSION_PATTERNS` table so adding a new framework only requires
 * one entry and one fixture in the companion test file.
 */

/** Shape shared with `env-json-reader.ts`. */
export interface ParsedEnv {
  source: 'env_json' | 'log_parse';
  frameworkVersion: string | null;
  frameworkSha: string | null;
  torchVersion: string | null;
  pythonVersion: string | null;
  cudaVersion: string | null;
  rocmVersion: string | null;
  driverVersion: string | null;
  gpuSku: string | null;
  extra: Record<string, unknown>;
}

/**
 * Framework → regex that captures the version string on the framework's first
 * startup log line. Each pattern is anchored on a unique marker so we don't
 * accidentally match a transient warning later in the log.
 *
 * Frameworks without a known version line map to `null`. When upstream adds
 * one (e.g. SGLang or Atom start logging their version), drop a regex in
 * here and add a fixture to `env-parser.test.ts`.
 */
const FRAMEWORK_VERSION_PATTERNS: Record<string, RegExp | null> = {
  trt: /\[TensorRT-LLM\]\s+TensorRT LLM version:\s*(\S+)/u,
  'dynamo-trt': /\[TensorRT-LLM\]\s+TensorRT LLM version:\s*(\S+)/u,
  // vLLM renders the "vLLM" banner as ASCII art, so we can't anchor on the
  // literal name. The `Initializing a V[N] LLM engine (vX.Y.Z)` line is
  // emitted by every recent vLLM and is unambiguous. As a secondary, the
  // banner line itself ends with `version X.Y.Z` and lives at `utils.py:299`
  // / `:233` — anchor on that file marker so we don't false-match unrelated
  // "version X.Y.Z" mentions later in the log.
  vllm: /(?:Initializing a V\d+ LLM engine \(v|\[utils\.py:\d+\][^\n]*?version\s+)(\d+\.\d+\.\d+[^\s)]*)/iu,
  'dynamo-vllm':
    /(?:Initializing a V\d+ LLM engine \(v|\[utils\.py:\d+\][^\n]*?version\s+)(\d+\.\d+\.\d+[^\s)]*)/iu,
  sglang: null,
  'mori-sglang': null,
  'dynamo-sglang': null,
  atom: null,
};

/** Cross-framework torch version line: `incompatible torch version 2.11.0a0+...`. */
const TORCH_VERSION_PATTERN = /\btorch version\s+(\S+?)(?=\s|$)/iu;

/** Cross-framework python detection: `python3.12` / `python3.10`. */
const PYTHON_VERSION_PATTERN = /\bpython(\d+\.\d+)\b/iu;

/**
 * Parse the env-relevant fields out of a server.log.
 *
 * The `framework` argument MUST be the normalized framework key (lowercase,
 * already passed through `normalizeFramework()` upstream). Unknown framework
 * keys are treated as "no version pattern" and return null for
 * `frameworkVersion` — they still get torch/python parsing.
 */
export function parseServerLogEnv(log: string, framework: string): ParsedEnv {
  const out: ParsedEnv = {
    source: 'log_parse',
    frameworkVersion: null,
    frameworkSha: null,
    torchVersion: null,
    pythonVersion: null,
    cudaVersion: null,
    rocmVersion: null,
    driverVersion: null,
    gpuSku: null,
    extra: {},
  };

  if (!log) return out;

  const fwPattern = FRAMEWORK_VERSION_PATTERNS[framework];
  if (fwPattern) {
    const m = log.match(fwPattern);
    if (m && m[1]) out.frameworkVersion = m[1];
  }

  const torchMatch = log.match(TORCH_VERSION_PATTERN);
  if (torchMatch && torchMatch[1]) {
    // Strip trailing punctuation that sometimes follows the version (e.g.
    // "torch version 2.9.0a0+145a3a7bda.nv25.10 for torchao..." → keep the
    // version, drop the trailing word "for").
    out.torchVersion = torchMatch[1].replace(/[.,;:]+$/u, '');
  }

  const pythonMatch = log.match(PYTHON_VERSION_PATTERN);
  if (pythonMatch && pythonMatch[1]) out.pythonVersion = pythonMatch[1];

  return out;
}
