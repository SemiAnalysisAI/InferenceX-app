import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

import { getHardwareConfig, type HardwareEntry } from '@/lib/constants';
import { runIdFromRunUrl } from '@/lib/known-issues';

interface RunProvenance {
  run_url?: string | null;
}

// Three-week recognition window, ending 2026-10-08 at 21:32 America/New_York.
const UMBP_DSPARK_LABEL_EXPIRES_AT = Date.parse('2026-10-09T01:32:00Z');
// Run 35879254139 is recognized through October 9, 2026 in America/New_York.
const UMBP_GAMMA6_LABEL_EXPIRES_AT = Date.parse('2026-10-10T04:00:00Z');

/** Display-only: never change framework/hardware keys used by filters and history. */
export function inferenceFrameworkLabelOverride(
  framework: string,
  runUrl?: string | null,
): string | undefined {
  if (resolveFrameworkAlias(framework) !== 'mori-sglang') return undefined;
  const runId = runIdFromRunUrl(runUrl);
  if (runId === '35879254139' && Date.now() < UMBP_GAMMA6_LABEL_EXPIRES_AT) {
    return 'UMBP MoRI SGLang';
  }
  const hasLabel =
    runId === '34926284365' ||
    (runId === '35166686551' && Date.now() < UMBP_DSPARK_LABEL_EXPIRES_AT);
  return hasLabel ? 'MoRI UMBP SGLang' : undefined;
}

/** Keep unofficial-run identity/markers while making its special engine visible. */
export function getInferenceRunLabel(
  label: string,
  points: readonly (RunProvenance & { framework?: string })[],
): string {
  const override = [
    ...new Set(
      points
        .map((point) => inferenceFrameworkLabelOverride(point.framework ?? '', point.run_url))
        .filter(Boolean),
    ),
  ]
    .sort()
    .join(' / ');
  return override ? `${label} (${override})` : label;
}

/**
 * A curve can carry forward points from multiple runs. Name both implementations
 * in that case, rather than calling historical MoRI points UMBP. Point tooltips
 * and table rows call this with only their own provenance. Raw CSV keys stay canonical.
 */
export function getInferenceHardwareConfig(
  hwKey: string,
  model: string | undefined,
  points: readonly RunProvenance[],
): HardwareEntry {
  const config = getHardwareConfig(hwKey, model);
  const framework = hwKey.split('_')[1] ?? '';
  const overrides = points.map((point) =>
    inferenceFrameworkLabelOverride(framework, point.run_url),
  );
  if (!overrides.some(Boolean)) return config;
  const label = [...new Set(overrides.map((override) => override ?? 'MoRI SGLang'))]
    .sort()
    .join(' / ');
  return {
    ...config,
    suffix: config.suffix.replace('MoRI SGLang', label),
    gpu: config.gpu.replace('MoRI SGLang', label),
  };
}

/** Preserve caller-provided metadata for other frameworks and unknown hardware. */
export function getPointHardwareConfig(
  point: RunProvenance & { hwKey: string | number; model?: string },
  fallback: HardwareEntry,
): HardwareEntry {
  const hwKey = String(point.hwKey);
  return resolveFrameworkAlias(hwKey.split('_')[1] ?? '') === 'mori-sglang'
    ? getInferenceHardwareConfig(hwKey, point.model, [point])
    : fallback;
}
