'use client';

import { useEffect, useRef } from 'react';

import EmbedScatterDisplay from '@/components/embed/embed-scatter-display';
import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { track } from '@/lib/analytics';
import { readEmbedChartVariant } from '@/lib/embed-params';
import { type UrlStateParams, seedUrlState } from '@/lib/url-state';

interface Props {
  params: UrlStateParams & { i_chart?: string };
  canonicalHref: string;
}

/**
 * Client component for `/embed/scatter`. Seeds the internal URL-state cache
 * synchronously before any provider mounts so the first render of the chart
 * already reflects the requested embed params, then wraps the providers and
 * the chart display.
 *
 * Embed URLs use the same `g_*` / `i_*` keys as the main site — params flow
 * straight through `seedUrlState` with no translation. The only embed-specific
 * key is `i_chart` (which chart variant to render).
 *
 * When `i_active` is present, those hwKeys become the allow-list for the embed:
 * the legend and chart universe are restricted to exactly those GPUs. The
 * viewer can toggle them on/off but cannot add GPUs outside the set.
 *
 * Lives outside the `(dashboard)` route group, so we re-establish the
 * provider stack here (`UnofficialRunProvider` → `GlobalFilterProvider` →
 * `InferenceProvider`). `QueryProvider` is in the root layout and inherits.
 */
export default function EmbedScatterClient({ params, canonicalHref }: Props) {
  const seededRef = useRef(false);
  if (!seededRef.current) {
    // params are already in site-style UrlStateParams shape — seed directly.
    const { i_chart: _chart, ...urlParams } = params;
    seedUrlState(urlParams);
    seededRef.current = true;
  }

  const chartType = readEmbedChartVariant(params.i_chart);

  // Build the allow-list from i_active: restrict the embed legend/chart to
  // only the GPUs the creator chose. null means "no restriction" (all GPUs).
  const embedAllowedHwTypes = params.i_active
    ? new Set(params.i_active.split(',').filter(Boolean))
    : null;

  // Fire `embed_view` once on mount with referrer + host so external embed
  // traffic is attributable. Strict mode in dev double-fires effects, but
  // that's only in dev — production fires once.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    const referrer = typeof document === 'undefined' ? '' : document.referrer;
    let embedHost: string;
    try {
      embedHost = referrer ? new URL(referrer).host : '';
    } catch {
      embedHost = '';
    }
    const gpus = params.i_active ? params.i_active.split(',').filter(Boolean) : [];
    track('embed_view', {
      embed_chart: 'scatter',
      chart_type: chartType,
      model: params.g_model,
      sequence: params.i_seq,
      precisions: params.i_prec,
      gpus,
      gpu_count: gpus.length,
      y_metric: params.i_metric,
      referrer,
      embed_host: embedHost,
    });
  }, []);

  return (
    <UnofficialRunProvider>
      <GlobalFilterProvider>
        <InferenceProvider activeTab="inference" embedAllowedHwTypes={embedAllowedHwTypes}>
          <div className="flex h-screen min-h-0 flex-col p-1 sm:p-2">
            <div className="min-h-0 flex-1">
              <EmbedScatterDisplay chartType={chartType} canonicalHref={canonicalHref} />
            </div>
          </div>
        </InferenceProvider>
      </GlobalFilterProvider>
    </UnofficialRunProvider>
  );
}
