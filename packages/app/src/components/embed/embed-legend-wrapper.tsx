'use client';

import { useSyncExternalStore } from 'react';

import { ChevronDown } from 'lucide-react';

const LG_QUERY = '(min-width: 1024px)';

function subscribeLg(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getLgSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia(LG_QUERY).matches;
}

function getLgServerSnapshot() {
  return false;
}

/**
 * Embed-only legend shell.
 *
 * Below `lg`: a native `<details>` collapsible with a styled summary button.
 * Closed by default. When open, content is absolutely positioned above the
 * summary (`bottom-full`) so it overlays the chart instead of growing layout
 * height in fill-height embeds. Content scrolls inside a viewport-clamped max
 * height so the panel never escapes a short iframe.
 *
 * Above `lg`: the `<details>` UI is skipped and the legend renders in a flex
 * column sized by the parent height container.
 *
 * **Single `{children}` mount:** responsive layout is chosen with
 * `useSyncExternalStore` + `matchMedia` so React never renders the same
 * legend subtree twice (which would drop controls like switches from one branch).
 */
export function EmbedLegendWrapper({ children }: { children: React.ReactNode }) {
  const isLg = useSyncExternalStore(subscribeLg, getLgSnapshot, getLgServerSnapshot);

  if (isLg) {
    return (
      <div data-testid="embed-legend-panel" className="lg:h-full">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">{children}</div>
      </div>
    );
  }

  return (
    <div data-testid="embed-legend-panel" className="lg:h-full">
      <div className="relative">
        <details className="group">
          <summary className="flex w-full cursor-pointer select-none list-none items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden">
            <span>Legend</span>
            <ChevronDown
              size={14}
              className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div
            data-testid="embed-legend-dropdown"
            className="absolute bottom-full left-0 right-0 z-40 mb-1 flex max-h-[min(24rem,calc(100dvh-6rem))] min-h-0 flex-col overflow-y-auto overflow-x-hidden rounded-md border border-border bg-background shadow-lg"
          >
            {children}
          </div>
        </details>
      </div>
    </div>
  );
}
