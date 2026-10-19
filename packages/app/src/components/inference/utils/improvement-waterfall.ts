import type { WorkflowInfoResponse } from '@/lib/api/api';
import type { TrendDataPoint, TrendSource } from '../types';
import { changelogConfigToHwKey } from './changelogFormatters';

export interface ImprovementStep {
  kind: 'baseline' | 'gain' | 'best';
  date: string;
  from: number;
  to: number;
  delta: number;
  sources: TrendSource[];
}

const asStep = (
  point: TrendDataPoint,
  kind: ImprovementStep['kind'],
  from: number,
): ImprovementStep => ({
  kind,
  date: point.date,
  from,
  to: point.value,
  delta: point.value - from,
  sources: point.sources ?? [],
});

/** Recoveries to a previous record and synthetic extensions are not new gains. */
export function buildImprovementWaterfall(
  data: readonly TrendDataPoint[],
  lowerIsBetter = false,
): ImprovementStep[] {
  const points = data
    .filter((point) => !point.synthetic && Number.isFinite(point.value) && point.value > 0)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  if (points.length === 0) return [];
  let best = points[0];
  const steps = [asStep(best, 'baseline', 0)];
  for (const point of points.slice(1)) {
    const improvement = lowerIsBetter ? best.value - point.value : point.value - best.value;
    if (improvement <= Math.max(1, Math.abs(best.value)) * 1e-9) continue;
    steps.push(asStep(point, 'gain', best.value));
    best = point;
  }
  steps.push(asStep(best, 'best', 0));
  return steps;
}

/** A shared date does not establish a link between a changelog and a measurement. */
export function matchingChanges(sources: TrendSource[], workflows: WorkflowInfoResponse[]) {
  const changes = workflows.flatMap((workflow) =>
    workflow.changelogs.filter((change) =>
      sources.some(
        (source) =>
          Number(change.workflow_run_id) === source.runId &&
          change.date === source.date &&
          change.config_keys.some((key) => {
            const [model, precision] = key.toLowerCase().split('-');
            const agentic = key.toLowerCase().split('-').includes('agentic');
            return (
              model === source.model.toLowerCase() &&
              precision === source.precision.toLowerCase() &&
              agentic === (source.benchmarkType === 'agentic_traces') &&
              changelogConfigToHwKey(key, source.benchmarkType) === source.hwKey
            );
          }),
      ),
    ),
  );
  return [
    ...new Map(
      changes.map((change) => [
        JSON.stringify([
          change.workflow_run_id,
          change.config_keys,
          change.description,
          change.pr_link,
        ]),
        change,
      ]),
    ).values(),
  ];
}

export function pullRequestLinks(changes: ReturnType<typeof matchingChanges>) {
  return [
    ...new Set(
      changes
        .flatMap((change) => (change.pr_link ? [change.pr_link] : []))
        .filter((url) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url)),
    ),
  ];
}
