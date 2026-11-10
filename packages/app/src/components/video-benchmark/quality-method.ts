import { mayHaveClips, SUBJECT_ORDER, type StageCandidate } from './clip-stage';
import { leadCell, losslessTwin } from './deployment';
import type { MetricOptions, VideoPoint } from './metrics';
import { isLossy } from './optimizations';
import { resultsClipGroups, resultsClipReference } from './results-clips';

/** Reference PSNR spread of the scored lossless clips the stage loaded. */
export interface ReferencePsnrRange {
  min: number;
  max: number;
  clips: number;
  /** Hardware keys with at least one scored clip, in lead order. */
  hardware: string[];
}

/**
 * The PSNR range of lossless clips against the Diffusers reference, over the visible leads'
 * loaded clips. A lossy lead, the matched-noise rerun, and an identical, incompatible or unscored
 * pair carry no finite score of a lossless CI clip, so none counts. Null until one clip does.
 */
export function referencePsnrRange(leads: readonly StageCandidate[]): ReferencePsnrRange | null {
  const scores: number[] = [];
  const hardware: string[] = [];
  for (const { point, side } of leads) {
    if (!side || isLossy(point)) continue;
    const before = scores.length;
    for (const group of resultsClipGroups([side])) {
      // An identical or incompatible pair has no PSNR.
      const psnr = group.scope ? null : group.clips.get(side.hardwareKey)?.quality?.psnrDb;
      if (typeof psnr === 'number' && Number.isFinite(psnr)) scores.push(psnr);
    }
    if (scores.length > before) hardware.push(side.hardwareKey);
  }
  if (scores.length === 0) return null;
  return { min: Math.min(...scores), max: Math.max(...scores), clips: scores.length, hardware };
}

/**
 * The lead "Show me" plays against its Diffusers reference: the first, in stage order, whose
 * loaded clips have a playable reference pair, trying the named run's leads before the official
 * ones as the stage does. A lossy lead is no lossless example.
 */
export function showMeTarget(
  leads: readonly StageCandidate[],
  namedRun?: string,
): VideoPoint | null {
  const ordered = SUBJECT_ORDER.flatMap((key) =>
    leads.filter(({ point }) => point.hardwareKey === key),
  );
  const named = ordered.filter(({ point }) => point.runId === namedRun);
  for (const lead of [...named, ...ordered.filter((item) => !named.includes(item))]) {
    if (!lead.side || isLossy(lead.point)) continue;
    const groups = resultsClipGroups([lead.side]).filter((group) => !group.scope);
    if (groups.some((group) => resultsClipReference(group, new Set()) !== null)) return lead.point;
  }
  return null;
}

export interface LossyPair {
  lossy: VideoPoint;
  twin: VideoPoint;
}

/**
 * The drawn lossy cell "See what changes" plays against its lossless twin. Both must be points
 * that may have clips. The named run's cells come first, so an overlay pairs within its own run;
 * then stage hardware order, and each hardware's lossy lead.
 */
export function seeChangesPair(
  drawn: readonly VideoPoint[],
  deployments: readonly VideoPoint[],
  options: MetricOptions,
  namedRun?: string | null,
): LossyPair | null {
  const pairs = drawn.flatMap((lossy) => {
    if (!isLossy(lossy) || !mayHaveClips(lossy)) return [];
    const twin = losslessTwin(lossy, deployments);
    return twin && mayHaveClips(twin) ? [{ lossy, twin }] : [];
  });
  const named = pairs.filter((pair) => pair.lossy.runId === namedRun);
  const pool = named.length > 0 ? named : pairs;
  for (const key of SUBJECT_ORDER) {
    const own = pool.filter((pair) => pair.lossy.hardwareKey === key);
    const lead = leadCell(
      own.map((pair) => pair.lossy),
      key,
      options,
      { lossy: true },
    );
    const pick = own.find((pair) => pair.lossy === lead) ?? own[0];
    if (pick) return pick;
  }
  return null;
}
