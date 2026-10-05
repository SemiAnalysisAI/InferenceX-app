import { H3_API_REFERENCE } from './api-reference';
import { VIDEO_HARDWARE_ROSTER, type VideoHardwareRosterEntry } from './hardware';
import type { VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';

export const VIDEO_MODELS = {
  h3: { label: 'MiniMax-H3', modelId: 'MiniMaxAI/MiniMax-H3', apiReference: H3_API_REFERENCE },
  wan22: {
    label: 'Wan2.2-T2V-A14B',
    modelId: 'Wan-AI/Wan2.2-T2V-A14B-Diffusers',
    apiReference: null,
  },
} as const;
export type VideoModel = keyof typeof VIDEO_MODELS;

/** The original local MVP used the short checkpoint ID. Preserve that selection alias. */
export function canonicalVideoModelId(model: string): string {
  return model === 'Wan-AI/Wan2.2-T2V-A14B' ? VIDEO_MODELS.wan22.modelId : model;
}

/** Filter before workload selection so one model cannot suppress or inherit another's results.
 * Legacy sources without model metadata belong to the existing H3-only artifact catalog.
 * New model producers must identify their model even when generation has no observations.
 */
export function videoModelHistory(
  pages: VideoHistoryPage[],
  model: VideoModel,
): VideoHistoryPage[] {
  const modelId = VIDEO_MODELS[model].modelId;
  return pages.map((page) => ({
    ...page,
    entries: page.entries.flatMap((entry) => {
      const sources = entry.sources.flatMap((source) => {
        const identities = new Set(
          source.observations
            .map((observation) => canonicalVideoModelId(observation.model))
            .filter(Boolean),
        );
        // Ambiguous mixed-model sources cannot assign serving/fidelity evidence safely.
        if (identities.size > 1) return [];
        const identity = canonicalVideoModelId(source.model || [...identities][0] || '');
        if (
          source.model &&
          identities.size > 0 &&
          !identities.has(canonicalVideoModelId(source.model))
        )
          return [];
        if (
          !(identity
            ? identity === modelId
            : model === 'h3' && entry.artifact.name.startsWith('h3-'))
        )
          return [];
        if (model === 'h3') return [source];
        // Wan's video-only quality contract is not defined in this MVP. Never apply H3's audio rubric.
        return [
          {
            ...source,
            observations: source.observations.map((observation) => ({
              ...observation,
              quality: null,
            })),
            ...(source.serving
              ? { serving: source.serving.map((cell) => ({ ...cell, qualitySloGoodput: null })) }
              : {}),
          },
        ];
      });
      return sources.length > 0 ||
        (model === 'h3' &&
          entry.artifact.name.startsWith('h3-') &&
          entry.sources.length === 0 &&
          entry.error)
        ? [{ ...entry, sources }]
        : [];
    }),
  }));
}

export function videoModelHardware(
  model: VideoModel,
  points: VideoPoint[],
): readonly VideoHardwareRosterEntry[] {
  if (model === 'h3') return VIDEO_HARDWARE_ROSTER;
  return [
    ...new Set(points.flatMap((point) => (point.hardwareKey ? [point.hardwareKey] : []))),
  ].map((key) => ({ key }));
}
