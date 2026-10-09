'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    title: 'ubenchX Microbenchmarks',
    subtitle: 'Low-level GPU microbenchmarks measuring fundamental hardware characteristics.',
    memBwTitle: 'Device-Memory Copy Bandwidth',
    memBwDesc:
      'Measures device-memory copy bandwidth across message sizes from 8 B to 16 GiB on NVIDIA and AMD GPUs.',
    smL2Title: 'SM-SM L2 Latency Difference',
    smL2Desc:
      'L2 pointer-chase benchmark revealing SM-to-SM latency differences and GPC/die topology structure.',
  },
  zh: {
    title: 'ubenchX 微基准测试',
    subtitle: '底层 GPU 微基准测试，测量基础硬件特性。',
    memBwTitle: '显存拷贝带宽',
    memBwDesc: '在 NVIDIA 和 AMD GPU 上测量 8 B 至 16 GiB 各消息大小的显存拷贝带宽。',
    smL2Title: 'SM 间 L2 延迟差异',
    smL2Desc: '基于 L2 指针追踪的基准测试，揭示 SM 间延迟差异和 GPC/die 拓扑结构。',
  },
} as const;

const TESTS = [
  {
    slug: 'mem-bw',
    titleKey: 'memBwTitle' as const,
    descKey: 'memBwDesc' as const,
    icon: '📊',
  },
  {
    slug: 'sm-l2-distance',
    titleKey: 'smL2Title' as const,
    descKey: 'smL2Desc' as const,
    icon: '🔬',
  },
];

export function UbenchxHub() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TESTS.map((test) => (
          <Link
            key={test.slug}
            href={`${prefix}/ubenchx/${test.slug}`}
            className="group block rounded-lg border p-5 transition-colors hover:border-foreground/30 hover:bg-muted/50"
            data-testid={`ubenchx-test-${test.slug}`}
            onClick={() => track('ubenchx_test_selected', { test: test.slug })}
          >
            <div className="text-lg font-semibold group-hover:text-foreground">
              {t[test.titleKey]}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{t[test.descKey]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
