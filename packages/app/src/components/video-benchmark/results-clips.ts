import { at, text } from './bundle';
import { compareSide, type CaseRecord, type CompareSide } from './compare';
import type { MetricOptions, VideoPoint } from './metrics';
import { leadCell } from './deployment';
import { RESULTS_HARDWARE, type ResultCell } from './results';
import { servingCells } from './serving';
import { storedBundle, type StoredArtifact } from './stored';
import type { ClipQuality } from './reference-quality';

/** A named result owns its hardware's clip, even when the official result is newer or faster. */
export function resultsClipPoints(
  cells: readonly Pick<ResultCell, 'point' | 'overlay'>[],
  options: MetricOptions,
): VideoPoint[] {
  return RESULTS_HARDWARE.flatMap((key) => {
    const choices = cells.filter((cell) => cell.point.hardwareKey === key);
    const named = leadCell(
      choices.filter((cell) => cell.overlay).map((cell) => cell.point),
      key,
      options,
    );
    const lead =
      named ??
      leadCell(
        choices.filter((cell) => !cell.overlay).map((cell) => cell.point),
        key,
        options,
      );
    return lead && lead.p50 !== null ? [lead] : [];
  });
}

export interface ResultsClipSide extends CompareSide {
  pointId: string;
  hardwareKey: string;
  /** Exact recorded model, revision and generation settings, not a display label. */
  generationKey: string;
  quality: Map<string, ClipQuality>;
}

export function publishedResultsSide(saved: StoredArtifact, point: VideoPoint): ResultsClipSide {
  const manifestSha = point.id.split(':')[0];
  const sources = saved.sources.filter(
    (source) =>
      !source.kind &&
      source.checksums.some(([path, sha]) => path === 'manifest.json' && sha === manifestSha),
  );
  if (sources.length !== 1) throw new Error('Selected observation is not published');
  const exact = { ...saved, sources };
  const side = compareSide(exact, point);
  const cellId = point.cell ?? `c${point.concurrency ?? 1}`;
  const cell = servingCells(storedBundle(sources[0])).find((item) => item.id === cellId);
  if (!cell) throw new Error('Selected cell is not published');
  const plan = at(cell.run, 'plan');
  const model = text(at(plan, 'model_id'));
  const revision = text(at(plan, 'model_revision'));
  const generation = at(plan, 'generation');
  const identified = model !== '' && revision !== '' && generation !== null;
  const quality = new Map<string, ClipQuality>();
  for (const record of side.records) {
    const matches = (saved.quality ?? []).filter((pair) => {
      const c = pair.candidate;
      return (
        c.run_id === saved.runId &&
        c.artifact_id === saved.artifact.id &&
        c.source_id === sources[0].id &&
        c.manifest_sha256 === manifestSha &&
        c.cell_id === cellId &&
        c.slot_id === record.slotId &&
        c.case_id === record.caseId &&
        c.prompt === record.prompt &&
        c.seed === record.seed &&
        c.media_path === record.mediaPath &&
        sources[0].checksums.some(
          ([path, sha]) => path === record.mediaPath && sha === c.media_sha256,
        )
      );
    });
    if (matches.length === 1) quality.set(record.slotId, matches[0]);
  }
  return {
    ...side,
    pointId: point.id,
    hardwareKey: point.hardwareKey ?? '',
    generationKey: identified ? (point.workloadKey ?? '') : '',
    quality,
  };
}

export interface ResultsClip {
  side: ResultsClipSide;
  record: CaseRecord;
  url: string;
  quality: ClipQuality | null;
}
export interface ResultsClipGroup {
  key: string;
  prompt: string;
  seed: number;
  take: number;
  clips: Map<string, ResultsClip>;
}

export function resultsClipGroups(sides: ResultsClipSide[]): ResultsClipGroup[] {
  const groups = new Map<string, ResultsClipGroup>();
  for (const side of sides) {
    if (!side.generationKey) continue;
    for (const record of side.records) {
      const take = Number(/^measurement-r(?<take>\d+)-c\d+$/u.exec(record.slotId)?.groups?.take);
      const url = record.mediaPath === null ? undefined : side.urls.get(record.mediaPath);
      if (
        !record.prompt ||
        record.seed === null ||
        !Number.isFinite(record.seed) ||
        !Number.isSafeInteger(take) ||
        take < 1 ||
        record.valid !== true ||
        record.status !== 'succeeded' ||
        !url
      )
        continue;
      const key = JSON.stringify([side.generationKey, record.prompt, record.seed, take]);
      const group = groups.get(key) ?? {
        key,
        prompt: record.prompt,
        seed: record.seed,
        take,
        clips: new Map<string, ResultsClip>(),
      };
      // Duplicate case identities in one cell are ambiguous, not extra comparison candidates.
      if (group.clips.has(side.hardwareKey)) continue;
      group.clips.set(side.hardwareKey, {
        side,
        record,
        url,
        quality: side.quality.get(record.slotId) ?? null,
      });
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.clips.size - a.clips.size || a.take - b.take);
}

/** One explicit reference for the visible paired clips; hardware identity never selects it. */
export function resultsClipReference(group: ResultsClipGroup | null, hidden: ReadonlySet<string>) {
  const references = new Map<string, ClipQuality['reference']>();
  for (const [key, clip] of group?.clips ?? []) {
    if (
      hidden.has(key) ||
      !clip.quality ||
      clip.quality.status === 'incompatible' ||
      !clip.quality.reference.url
    )
      continue;
    const reference = clip.quality.reference;
    references.set(
      JSON.stringify([reference.receipt_sha256, reference.media_path, reference.media_sha256]),
      reference,
    );
  }
  return references.size === 1 ? [...references.values()][0] : null;
}

/** Same per-clip projection as the UI, including absent pairs; no per-cell PSNR aggregation. */
export function resultsClipEvidence(sides: ResultsClipSide[]) {
  return resultsClipGroups(sides).map((group) => ({
    key: group.key,
    prompt: group.prompt,
    seed: group.seed,
    take: group.take,
    clips: [...group.clips].map(([hardware, clip]) => ({
      hardware,
      pointId: clip.side.pointId,
      slotId: clip.record.slotId,
      caseId: clip.record.caseId,
      mediaPath: clip.record.mediaPath,
      quality: clip.quality,
    })),
  }));
}

/** Absolute RGB difference at matched geometry. This display is not a PSNR measurement. */
export function absoluteFrameDifference(
  reference: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  gain = 4,
): Uint8ClampedArray {
  if (reference.length !== candidate.length || reference.length % 4 !== 0)
    throw new Error('Frame geometry mismatch');
  const output = new Uint8ClampedArray(reference.length);
  for (let i = 0; i < output.length; i += 4) {
    output[i] = Math.abs(reference[i] - candidate[i]) * gain;
    output[i + 1] = Math.abs(reference[i + 1] - candidate[i + 1]) * gain;
    output[i + 2] = Math.abs(reference[i + 2] - candidate[i + 2]) * gain;
    output[i + 3] = 255;
  }
  return output;
}
