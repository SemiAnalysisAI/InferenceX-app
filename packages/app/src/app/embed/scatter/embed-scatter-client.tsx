'use client';

import { useEffect, useRef } from 'react';

import EmbedScatterDisplay from '@/components/embed/embed-scatter-display';
import { EmbedAttribution } from '@/components/embed/embed-attribution';
import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { track } from '@/lib/analytics';
import { type EmbedParams, embedParamsToUrlState } from '@/lib/embed-params';
import { seedUrlState } from '@/lib/url-state';

interface Props {
  params: EmbedParams;
  canonicalHref: string;
}

/**
 * Client component for `/embed/scatter`. Seeds the internal URL-state cache
 * synchronously before any provider mounts so the first render of the chart
 * already reflects the requested embed params, then wraps the providers and
 * the chart display.
 *
 * Lives outside the `(dashboard)` route group, so we re-establish the
 * provider stack here (`UnofficialRunProvider` → `GlobalFilterProvider` →
 * `InferenceProvider`). `QueryProvider` is in the root layout and inherits.
 */
export default function EmbedScatterClient({ params, canonicalHref }: Props) {
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seedUrlState(embedParamsToUrlState(params));
    seededRef.current = true;
  }

  // Fire `embed_view` once on mount with referrer + host so external embed
  // traffic is attributable. Strict mode in dev double-fires effects, but
  // that's only in dev — production fires once.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    let embedHost: string;
    try {
      embedHost = referrer ? new URL(referrer).host : '';
    } catch {
      embedHost = '';
    }
    const gpus = params.gpus ? params.gpus.split(',').filter(Boolean) : [];
    track('embed_view', {
      embed_chart: 'scatter',
      chart_type: params.chart,
      model: params.model,
      sequence: `${params.isl}/${params.osl}`,
      precisions: params.precisions,
      gpus,
      gpu_count: gpus.length,
      y_metric: params.y,
      referrer,
      embed_host: embedHost,
    });
  }, []);

  return (
    <UnofficialRunProvider>
      <GlobalFilterProvider>
        <InferenceProvider activeTab="inference">
          <div className="flex flex-col gap-2 p-2 sm:p-4 grow">
            <div className="grow">
              <EmbedScatterDisplay chartType={params.chart} />
            </div>
            <div className="flex justify-end pt-1">
              <EmbedAttribution canonicalHref={canonicalHref} />
            </div>
          </div>
        </InferenceProvider>
      </GlobalFilterProvider>
    </UnofficialRunProvider>
  );
}
