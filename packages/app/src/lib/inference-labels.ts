import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

import { getHardwareConfig, type HardwareEntry } from '@/lib/constants';
import { runIdFromRunUrl } from '@/lib/known-issues';

interface RunProvenance {
  run_url?: string | null;
}

// Three-week recognition window, ending 2026-10-08 at 21:32 America/New_York.
const UMBP_DSPARK_LABEL_EXPIRES_AT = Date.parse('2026-10-09T01:32:00Z');

/** Display-only: never change framework/hardware keys used by filters and history. */
export function inferenceFrameworkLabelOverride(
  framework: string,
  runUrl?: string | null,
): string | undefined {
  if (resolveFrameworkAlias(framework) !== 'mori-sglang') return undefined;
  const runId = runIdFromRunUrl(runUrl);
  const hasLabel =
    runId === '34926284365' ||
    (runId === '35166686551' && Date.now() < UMBP_DSPARK_LABEL_EXPIRES_AT);
  return hasLabel ? 'MoRI UMBP SGLang' : undefined;
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
  const override = points
    .map((point) => inferenceFrameworkLabelOverride(point.framework ?? '', point.run_url))
    .find(Boolean);
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
  const label = overrides.every(Boolean) ? 'MoRI UMBP SGLang' : 'MoRI SGLang / MoRI UMBP SGLang';
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
