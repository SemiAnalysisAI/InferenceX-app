import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

import { getHardwareConfig, type HardwareEntry } from '@/lib/catalog/constants';
import { runIdFromRunUrl } from '@/lib/benchmarks/known-issues';

interface RunProvenance {
  run_url?: string | null;
}

const UMBP_LABEL_RUNS = new Set(['34926284365']);

const TEMPORARY_UMBP_LABEL_RUNS: Record<string, { label: string; expiresAt: number }> = {
  '35166686551': {
    label: 'MoRI UMBP SGLang',
    expiresAt: Date.parse('2026-10-09T01:32:00Z'),
  },
  '35879254139': {
    label: 'UMBP MoRI SGLang',
    expiresAt: Date.parse('2026-10-10T04:00:00Z'),
  },
  '37181045340': {
    label: 'UMBP MoRI SGLang',
    expiresAt: Date.parse('2026-10-10T04:00:00Z'),
  },
};

export function inferenceFrameworkLabelOverride(
  framework: string,
  runUrl?: string | null,
): string | undefined {
  if (resolveFrameworkAlias(framework) !== 'mori-sglang') return undefined;
  const runId = runIdFromRunUrl(runUrl);
  if (runId === null) return undefined;
  if (UMBP_LABEL_RUNS.has(runId)) return 'MoRI UMBP SGLang';
  const override = TEMPORARY_UMBP_LABEL_RUNS[runId];
  return override && Date.now() < override.expiresAt ? override.label : undefined;
}

const RUN_TAG_MAX = 20;
const RUN_TAG_TAIL = 17;

export interface OverlayRunIdentity {
  id: number | string;
  branch?: string | null;
}

export function shortRunTag(run: OverlayRunIdentity): string {
  const branch = run.branch?.trim() || `run ${run.id}`;
  if (branch.length <= RUN_TAG_MAX) return branch;
  const segment = branch.slice(branch.lastIndexOf('/') + 1);
  if (segment.length > 0 && segment.length <= RUN_TAG_MAX) return segment;
  return `…${branch.slice(-RUN_TAG_TAIL)}`;
}

export function overlayRunTag(run: OverlayRunIdentity): string {
  return ` · ${shortRunTag(run)}`;
}

export function getOverlayLineLabel(
  hardwareLabel: string,
  run: OverlayRunIdentity,
  sharesHardware: boolean,
): string {
  return `${hardwareLabel}${sharesHardware ? overlayRunTag(run) : ''}`;
}

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

export function getPointHardwareConfig(
  point: RunProvenance & { hwKey: string | number; model?: string },
  fallback: HardwareEntry,
): HardwareEntry {
  const hwKey = String(point.hwKey);
  return resolveFrameworkAlias(hwKey.split('_')[1] ?? '') === 'mori-sglang'
    ? getInferenceHardwareConfig(hwKey, point.model, [point])
    : fallback;
}
