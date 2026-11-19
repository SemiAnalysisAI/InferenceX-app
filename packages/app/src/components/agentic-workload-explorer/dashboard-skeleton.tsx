'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat } from '@/components/ui/stat';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';

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
  return <SectionHeader label={label} detail={<Skeleton className="h-2.5 w-6" />} />;
}

export function StatGridSkeleton({ count = 17 }: { count?: number }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Stat
          key={i}
          boxed
          label={<Skeleton className="h-2.5 w-16" />}
          value={<Skeleton className="h-5 w-12" />}
          className="[&_dd]:flex [&_dd]:h-7 [&_dd]:items-center [&_dt]:flex [&_dt]:h-4 [&_dt]:items-center"
        />
      ))}
    </dl>
  );
}

export function ChartSkeleton() {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-[160px] w-full" />
    </Card>
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
