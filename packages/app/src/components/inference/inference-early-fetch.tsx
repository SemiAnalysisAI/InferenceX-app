'use client';

import { useSyncExternalStore } from 'react';

import type { Model } from '@/lib/catalog/data-mappings';
import { inferenceEarlyFetch } from '@/lib/prefetch/inference-early-fetch';

const subscribeNoop = () => () => {};

/**
 * Starts the Inference chart's first API requests during a document load, before hydration.
 * Only the server HTML and its hydration render the preloads and the script. A client navigation
 * renders nothing, so it never preloads data the route prefetch already holds.
 */
export function InferenceEarlyFetch({ routeModel }: { routeModel: Model | null }) {
  const documentRender = useSyncExternalStore(
    subscribeNoop,
    () => false,
    () => true,
  );
  if (!documentRender) return null;
  const { preloads, script } = inferenceEarlyFetch(routeModel);
  return (
    <>
      {preloads.map((href) => (
        <link key={href} rel="preload" as="fetch" crossOrigin="anonymous" href={href} />
      ))}
      <script
        id="inference-early-fetch"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: script }}
      />
    </>
  );
}
