import { at, number, text } from './bundle';
import { compareSide, type CaseRecord, type CompareSide } from './compare';
import type { VideoPoint } from './metrics';
import { servingCells } from './serving';
import { storedBundle, type StoredArtifact } from './stored';

export const RESULTS_CLIP_HARDWARE = ['gb200', 'b200', 'mi355x', 'h200'] as const;

export interface ResultsClipSide extends CompareSide {
  pointId: string;
  hardwareKey: string;
  /** Exact recorded model, revision and generation settings, not a display label. */
  generationKey: string;
  h200FiftyStepReference: boolean;
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
  return {
    ...side,
    pointId: point.id,
    hardwareKey: point.hardwareKey ?? '',
    generationKey: identified ? (point.workloadKey ?? '') : '',
    h200FiftyStepReference:
      point.hardwareKey === 'h200' &&
      model === 'MiniMaxAI/MiniMax-H3' &&
      /^[a-f0-9]{40,64}$/iu.test(revision) &&
      number(at(generation, 'num_inference_steps')) === 50,
  };
}

export interface ResultsClip {
  side: ResultsClipSide;
  record: CaseRecord;
  url: string;
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
      group.clips.set(side.hardwareKey, { side, record, url });
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.clips.size - a.clips.size || a.take - b.take);
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
