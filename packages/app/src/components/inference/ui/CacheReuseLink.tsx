'use client';

import Link from 'next/link';

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
  return (
    <Link
      href={cacheReuseHref(locale, point)}
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
