import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants/models';
import type { StagedChartScope } from '@semianalysisai/inferencex-db/queries/staged-chart-links';

import { makeRunComparisonEntry } from '@/components/inference/utils/comparisonEntry';
import { buildAvailabilityHwKey } from '@/lib/charts/chart-utils';

export interface StagedChartLink {
  label: string;
  url: string;
}

export function buildStagedChartLinks(
  origin: string,
  runId: string,
  scopes: readonly StagedChartScope[],
): StagedChartLink[] {
  if (!/^[1-9]\d*$/u.test(runId)) throw new Error('A positive run ID is required');
  const links = new Map<string, StagedChartLink>();
  for (const scope of scopes) {
    const model = DB_MODEL_TO_DISPLAY[scope.model];
    const sequence = rowToSequence(scope);
    if (!model || !sequence) {
      throw new Error(
        `Unsupported staged chart scope: ${scope.model}/${scope.benchmark_type}/${scope.isl}/${scope.osl}`,
      );
    }
    const hardware = buildAvailabilityHwKey(
      scope.hardware,
      scope.framework,
      scope.spec_method,
      scope.disagg,
      scope.benchmark_type,
    );
    const params = new URLSearchParams({
      g_model: model,
      i_seq: sequence,
      i_prec: scope.precision,
      i_gpus: hardware,
      i_dates: makeRunComparisonEntry(scope.date, runId),
      i_linelabel: '1',
      i_xmode: 'interactivity',
      i_metric: 'y_tpPerGpu',
    });
    const url = `${origin.replace(/\/+$/u, '')}/inference?${params}`;
    links.set(url, {
      label: `${model} · ${sequence} · ${scope.precision.toUpperCase()} · ${hardware} · ${scope.date}`,
      url,
    });
  }
  return [...links.values()].toSorted((a, b) => a.label.localeCompare(b.label));
}
