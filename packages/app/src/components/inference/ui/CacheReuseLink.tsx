'use client';

import Link from 'next/link';
import { useContext } from 'react';

import { GlobalFilterRunContext } from '@/components/GlobalFilterContext';
import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';
import { track } from '@/lib/analytics';
import { cacheReuseHref } from '@/lib/cache-reuse-link';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: { chart: 'Prefix cache reuse →', point: 'Prefix cache reuse for this config →' },
  zh: { chart: '前缀缓存复用 →', point: '查看此配置的前缀缓存复用 →' },
} as const;

/** Agentic-only link into the Prefix Cache Reuse tab, from the chart footer or a point. */
export function CacheReuseLink({ point, className }: { point?: PointMeta; className?: string }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  // A point can render outside the chart provider. Chart links subscribe to
  // current run intent instead of depending on the debounced URL-state store.
  const run = useContext(GlobalFilterRunContext);
  return (
    <Link
      href={cacheReuseHref(
        locale,
        point,
        run ? { date: run.selectedRunDate, id: run.requestedRunId } : undefined,
      )}
      data-testid="cache-reuse-link"
      className={
        className ?? 'text-xs leading-5 text-muted-foreground underline hover:text-foreground'
      }
      onClick={() =>
        track('inference_cache_reuse_link_clicked', {
          from: point ? 'point' : 'chart',
          ...(point ? { id: point.id } : {}),
        })
      }
    >
      {point ? t.point : t.chart}
    </Link>
  );
}
