/**
 * Reader for the upstream CI `env.json` artifact — the AUTHORITATIVE source
 * for the Reproduce Drawer's Environment tab.
 *
 * The upstream PR in `SemiAnalysisAI/InferenceX` writes this file next to
 * `server.log` inside each `server_logs_<config-key>/` artifact directory.
 * Our ingest path (`ingest-ci-run.ts`) prefers this when present and falls
 * back to `parseServerLogEnv()` otherwise.
 *
 * Contract (all fields optional; missing or null fields stay null in the
 * resulting `ParsedEnv`):
 *
 *   {
 *     "framework": "sglang",
 *     "framework_version": "0.4.3.post2",
 *     "framework_sha": "e136d70cdc6101007017c05d57fb4cec5d6ed98f",
 *     "image": "lmsysorg/sglang:latest",
 *     "torch": "2.5.1+cu124",
 *     "python": "3.12.7",
 *     "cuda": "12.4",
 *     "rocm": null,
 *     "driver": "560.35.03",
 *     "gpu_sku": "NVIDIA H100 80GB HBM3"
 *   }
 *
 * Any keys not listed above are preserved on `extra` so the upstream CI
 * can add fields without an app-side schema change.
 */

import type { ParsedEnv } from './env-parser';

const KNOWN_KEYS = new Set([
  'framework',
  'framework_version',
  'framework_sha',
  'image',
  'torch',
  'python',
  'cuda',
  'rocm',
  'driver',
  'gpu_sku',
]);

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parse the raw `env.json` text into a `ParsedEnv`. Throws if the input is
 * not valid JSON or is not an object — callers should `try/catch` and fall
 * back to `parseServerLogEnv()` so a malformed artifact never blocks ingest.
 */
export function readEnvJson(envJsonText: string): ParsedEnv {
  const raw = JSON.parse(envJsonText) as Record<string, unknown>;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('env.json must be a JSON object');
  }

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(k)) extra[k] = v;
  }

  return {
    source: 'env_json',
    frameworkVersion: str(raw.framework_version),
    frameworkSha: str(raw.framework_sha),
    torchVersion: str(raw.torch),
    pythonVersion: str(raw.python),
    cudaVersion: str(raw.cuda),
    rocmVersion: str(raw.rocm),
    driverVersion: str(raw.driver),
    gpuSku: str(raw.gpu_sku),
    extra,
  };
}
