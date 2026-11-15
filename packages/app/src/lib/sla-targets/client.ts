import type { SlaLatencyTargets } from '@semianalysisai/inferencex-constants';

import { ApiRequestError } from '@/lib/api/api-request-error';

import type { SlaTargetsDataset } from './dataset';
import { slaLatencyTargetsQuery, type SlaPointEvaluations } from './evaluation';

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new ApiRequestError(
      `API error: ${response.status} ${response.statusText}`,
      response.status,
      url,
    );
  }
  return response.json() as Promise<T>;
}

/** Serving configurations of one model with their tested load points. */
export function fetchSlaTargets(model: string | null, signal?: AbortSignal) {
  const query = model ? `?model=${encodeURIComponent(model)}` : '';
  return fetchJson<SlaTargetsDataset>(`/api/v1/sla-targets${query}`, signal);
}

/** Load points evaluated on the server against latency targets, keyed by point id. */
export function fetchSlaEvaluations(
  ids: readonly number[],
  targets: SlaLatencyTargets,
  signal?: AbortSignal,
) {
  return fetchJson<SlaPointEvaluations>(
    `/api/v1/sla-evaluations?ids=${ids.join(',')}&${slaLatencyTargetsQuery(targets)}`,
    signal,
  );
}
