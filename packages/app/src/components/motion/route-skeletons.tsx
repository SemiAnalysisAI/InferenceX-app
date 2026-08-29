import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading fallbacks for the dynamic compare routes' in-page Suspense
 * boundaries (NOT `loading.tsx` — a route-level boundary streams a 200 shell
 * before the page runs, degrading its notFound()/permanentRedirect() to soft
 * client-side handling; each page validates first, then suspends only its
 * data-dependent body behind these). They give navigation immediate visual
 * feedback while the benchmark payload streams in — the header stays mounted
 * and interactive, so context is preserved instead of a frozen or blank page.
 *
 * Dimensions mirror the destination pages (heading block + 600px chart area /
 * catalog card grid) so the finished content replaces the skeleton without
 * layout shift.
 */

/** Compare catalog: hero title block + catalog card grid. */
export function CompareRouteSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" data-testid="route-skeleton">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-2/3 max-w-xl" />
        <Skeleton className="h-5 w-3/4 max-w-3xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-3 p-5">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Compare detail routes: heading block + chart card. */
export function CompareDetailRouteSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" data-testid="route-skeleton">
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-2/3 max-w-2xl" />
        <Skeleton className="h-5 w-3/4 max-w-3xl" />
      </Card>
      <Card>
        <Skeleton className="h-7 w-2/4 mb-1" />
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-[600px] w-full" />
      </Card>
    </div>
  );
}
