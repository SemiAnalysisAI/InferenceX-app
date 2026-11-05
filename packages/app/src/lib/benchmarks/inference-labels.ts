import {
  resolveFrameworkAlias,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import { getHardwareConfig, type HardwareEntry } from '@/lib/catalog/constants';
import { runIdFromRunUrl } from '@/lib/benchmarks/known-issues';

interface RunProvenance {
  run_url?: string | null;
  router_name?: string | null;
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
  routerName?: string | null,
): string | undefined {
  const canonical = resolveFrameworkAlias(framework);
  if (routerName?.trim().toLowerCase() === 'smg') {
    if (canonical === 'sglang') return 'SMG SGLang';
    if (canonical === 'vllm') return 'SMG vLLM';
  }
  if (canonical !== 'mori-sglang') return undefined;
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
        .map((point) =>
          inferenceFrameworkLabelOverride(point.framework ?? '', point.run_url, point.router_name),
        )
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
    inferenceFrameworkLabelOverride(framework, point.run_url, point.router_name),
  );
  if (!overrides.some(Boolean)) return config;
  const frameworkLabel = resolveFrameworkPartLabel(model, framework);
  // One SMG point names the whole curve; individual tooltips retain point metadata.
  const label =
    overrides.find((override) => override?.startsWith('SMG ')) ??
    [...new Set(overrides.map((override) => override ?? frameworkLabel))].sort().join(' / ');
  return {
    ...config,
    suffix: config.suffix.replace(frameworkLabel, label),
    gpu: config.gpu.replace(frameworkLabel, label),
  };
}

export function getPointHardwareConfig(
  point: RunProvenance & { hwKey: string | number; model?: string },
  fallback: HardwareEntry,
): HardwareEntry {
  const hwKey = String(point.hwKey);
  return ['mori-sglang', 'sglang', 'vllm'].includes(
    resolveFrameworkAlias(hwKey.split('_')[1] ?? ''),
  )
    ? getInferenceHardwareConfig(hwKey, point.model, [point])
    : fallback;
}
