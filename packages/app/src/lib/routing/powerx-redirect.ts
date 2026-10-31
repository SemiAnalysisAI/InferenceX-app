import { getMeasuredMetricConfig } from '@/components/inference/measured-metric-config';

import { getInferenceModelBySlug } from './inference-model-slug';

const INFERENCE_PATH = /^(?<locale>\/zh)?\/inference(?:\/(?<slug>[^/]+))?\/?$/u;

/**
 * Power and energy metrics live on the PowerX tab. An Inference Performance link that
 * still carries one (`/inference?i_metric=y_measuredAvgPower`), or a power-tier filter
 * with no metric (`/inference?i_power=certified`), opens PowerX with the same
 * filters; the latter used to open the measured power chart, so it lands on the Power
 * draw view rather than PowerX's default Energy per token view. A model route
 * (`/inference/<slug>`) keeps its model as `g_model`, and its boundary compare, which
 * drew all four boundaries, becomes PowerX's `all`.
 * Returns null when the URL should load as is.
 */
const LEGACY_POWER_METRIC = 'y_measuredAvgPower';

function isPowerLink(params: URLSearchParams): boolean {
  const metric = params.get('i_metric');
  if (metric) return Boolean(getMeasuredMetricConfig(metric));
  // A power-tier filter without a metric used to open the measured power chart.
  return (params.get('i_power') ?? '')
    .split(',')
    .some((tier) => tier === 'certified' || tier === 'legacy');
}

export function powerXRedirectUrl(url: URL): URL | null {
  const match = INFERENCE_PATH.exec(url.pathname);
  if (!match || !isPowerLink(url.searchParams)) return null;
  const slug = match.groups?.slug;
  const model = slug ? getInferenceModelBySlug(slug)?.model : undefined;
  if (slug && !model) return null;
  const target = new URL(url);
  target.pathname = `${match.groups?.locale ?? ''}/powerx`;
  if (model && !target.searchParams.has('g_model')) target.searchParams.set('g_model', model);
  if (!target.searchParams.get('i_metric'))
    target.searchParams.set('i_metric', LEGACY_POWER_METRIC);
  if (target.searchParams.get('i_pcompare') === 'boundaries') {
    target.searchParams.set('i_pcompare', 'all');
  }
  return target;
}
