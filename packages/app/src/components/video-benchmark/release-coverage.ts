import type { VideoHistoryPage } from './history';
import { canonicalVideoModelId, VIDEO_MODELS, type VideoModel } from './models';
import { DASHBOARD_SAMPLE_FLOOR } from './points';
import { VIDEO_ENGINES } from './producer-identity';

export function videoReleaseCoverage(pages: VideoHistoryPage[]) {
  return (['h3', 'wan22'] as const satisfies readonly VideoModel[]).flatMap((model) =>
    VIDEO_ENGINES.map((engine) => {
      const seen = new Set<string>();
      const sources = pages.flatMap((page) =>
        page.entries.flatMap((entry) =>
          entry.sources.flatMap((source) => {
            if (
              canonicalVideoModelId(source.model ?? '') !== VIDEO_MODELS[model].modelId ||
              source.producer?.engine.name !== engine ||
              source.kind !== 'observation'
            )
              return [];
            const identity = `${source.id}:${source.sha256 ?? entry.id}`;
            if (seen.has(identity)) return [];
            seen.add(identity);
            return [
              {
                runId: entry.runId,
                artifactId: entry.artifact.id,
                sourceId: source.id,
                producer: source.producer,
                status:
                  source.error || source.execution === 'failed'
                    ? ('failed' as const)
                    : source.observations.some(
                          (observation) =>
                            observation.samples >= DASHBOARD_SAMPLE_FLOOR &&
                            (observation.valid ?? 0) >= DASHBOARD_SAMPLE_FLOOR,
                        )
                      ? ('sample_floor_met' as const)
                      : ('history_only' as const),
                error: source.error,
              },
            ];
          }),
        ),
      );
      return { model, engine, status: sources[0]?.status ?? ('not_published' as const), sources };
    }),
  );
}
