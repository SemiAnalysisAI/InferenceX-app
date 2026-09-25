import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

import { getHardwareConfig, type HardwareEntry } from '@/lib/constants';
import { runIdFromRunUrl } from '@/lib/known-issues';

interface RunProvenance {
  run_url?: string | null;
}

/** MoRI runs labeled UMBP indefinitely. */
const UMBP_LABEL_RUNS = new Set(['34926284365']);

/**
 * Run-specific recognition labels and expiry (epoch ms).
 * Once expired, the run falls back to the standard label.
 */
const TEMPORARY_UMBP_LABEL_RUNS: Record<string, { label: string; expiresAt: number }> = {
  // DSpark on dsv4 AgentX disagg (InferenceX#3188): ends 2026-10-08 21:32 America/New_York.
  '35166686551': {
    label: 'MoRI UMBP SGLang',
    expiresAt: Date.parse('2026-10-09T01:32:00Z'),
  },
  // UMBP linker + DSpark gamma 6 (InferenceX#3256): through October 9, 2026 America/New_York.
  '35879254139': {
    label: 'UMBP MoRI SGLang',
    expiresAt: Date.parse('2026-10-10T04:00:00Z'),
  },
};

/** Display-only: never change framework/hardware keys used by filters and history. */
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

/** Keep unofficial-run identity/markers while making its special engine visible. */
/** Leads every unofficial-run label, in line labels and legend rows alike. */
export const OVERLAY_LABEL_MARKER = '✕ ';
const RUN_TAG_MAX = 20;
const RUN_TAG_TAIL = 17;

export interface OverlayRunIdentity {
  id: number | string;
  branch?: string | null;
}

/**
 * Short, still recognisable name for a run: the whole branch when it is short,
 * else its last path segment, else the branch tail (klaud nightlies end in
 * `<date>-<sha>`). Falls back to the run id when the branch is unknown.
 */
export function shortRunTag(run: OverlayRunIdentity): string {
  const branch = run.branch?.trim() || `run ${run.id}`;
  if (branch.length <= RUN_TAG_MAX) return branch;
  const segment = branch.slice(branch.lastIndexOf('/') + 1);
  if (segment.length > 0 && segment.length <= RUN_TAG_MAX) return segment;
  return `…${branch.slice(-RUN_TAG_TAIL)}`;
}

/** ` · <tag>` appended to an overlay line label when other runs draw the same hardware. */
export function overlayRunTag(run: OverlayRunIdentity): string {
  return ` · ${shortRunTag(run)}`;
}

/**
 * Line-label text for an unofficial-run curve. Pills name the hardware, not the
 * branch: branch names run to 70+ characters and the legend already carries
 * them. The run tag is added only when several overlay runs draw the same
 * hardware, so the pills stay distinguishable.
 */
export function getOverlayLineLabel(
  hardwareLabel: string,
  run: OverlayRunIdentity,
  sharesHardware: boolean,
): string {
  return `${OVERLAY_LABEL_MARKER}${hardwareLabel}${sharesHardware ? overlayRunTag(run) : ''}`;
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
