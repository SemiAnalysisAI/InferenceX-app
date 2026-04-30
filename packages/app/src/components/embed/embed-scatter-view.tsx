'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { track } from '@/lib/analytics';

export function EmbedScatterView() {
  useEffect(() => {
    track('embed_view', {
      embed_type: 'scatter',
      referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : 'direct',
    });
  }, []);

  const canonicalHref = useMemo(() => {
    if (typeof window === 'undefined') return '/inference';
    const url = new URL(window.location.href);
    url.pathname = '/inference';
    return `${url.pathname}${url.search}`;
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1280px] p-2 sm:p-4">
      <UnofficialRunProvider>
        <GlobalFilterProvider>
          <InferenceProvider activeTab="inference">
            <InferenceChartDisplay />
          </InferenceProvider>
        </GlobalFilterProvider>
      </UnofficialRunProvider>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Data by{' '}
        <Link className="underline hover:text-foreground" href={canonicalHref} target="_blank">
          SemiAnalysis InferenceX
        </Link>
      </p>
    </main>
  );
}
