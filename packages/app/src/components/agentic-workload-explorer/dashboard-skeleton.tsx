'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    stats: 'Stats',
    usage: 'Usage',
  },
  zh: {
    stats: '统计',
    usage: '用量',
  },
} as const;

export function SkeletonSectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
      <Skeleton className="h-2.5 w-6" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <Skeleton className="h-2.5 w-16 mb-2" />
      <Skeleton className="h-5 w-12" />
    </div>
  );
}

export function StatGridSkeleton({ count = 17 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-[160px] w-full" />
    </div>
  );
}

export function DashboardOverviewSkeleton() {
  const t = STRINGS[useLocale()];
  return (
    <div className="space-y-5">
      <section>
        <SkeletonSectionHeader label={t.stats} />
        <StatGridSkeleton />
      </section>
      <section>
        <SkeletonSectionHeader label={t.usage} />
        <ChartSkeleton />
      </section>
    </div>
  );
}
