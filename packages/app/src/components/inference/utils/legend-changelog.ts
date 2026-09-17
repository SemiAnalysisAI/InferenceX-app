import type { ChangelogMetadata, InferenceData, RunInfo } from '../types';
import { MODEL_PREFIX_MAPPING } from '@/lib/data-mappings';
import { runIdFromRunUrl } from '@/lib/known-issues';
import { configKeyMatchesHwKey } from './changelogFormatters';

type LegendPoint = Pick<InferenceData, 'hwKey' | 'model' | 'precision' | 'run_url'>;

/** A hardware legend must not attribute a mixed-run curve to one run's changelog. */
export function legendChangelogsByHardware(
  points: readonly LegendPoint[],
  availableRuns: Record<string, RunInfo> | null | undefined,
  benchmarkType: 'single_turn' | 'agentic_traces',
): Map<string, { runId: string; entries: ChangelogMetadata['entries'] }> {
  const grouped = new Map<string, LegendPoint[]>();
  for (const point of points) {
    const group = grouped.get(point.hwKey) ?? [];
    group.push(point);
    grouped.set(point.hwKey, group);
  }

  const changelogs = new Map<string, { runId: string; entries: ChangelogMetadata['entries'] }>();
  for (const [hwKey, group] of grouped) {
    const runIds = new Set(group.map((point) => runIdFromRunUrl(point.run_url)));
    const runId = runIds.values().next().value;
    if (runIds.size !== 1 || !runId) continue;
    const entries = availableRuns?.[runId]?.changelog?.entries.filter((entry) =>
      entry.config_keys.some((key) => {
        const [model, precision] = key.split('-');
        return (
          configKeyMatchesHwKey(key, hwKey, benchmarkType) &&
          group.some(
            (point) =>
              point.precision === precision && point.model === MODEL_PREFIX_MAPPING[model!],
          )
        );
      }),
    );
    if (entries?.length) changelogs.set(hwKey, { runId, entries });
  }
  return changelogs;
}
