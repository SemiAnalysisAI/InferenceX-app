'use client';

import { useRouter } from 'next/navigation';

import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    title: 'ubenchX Microbenchmarks (Beta)',
    subtitle: 'Low-level GPU microbenchmarks measuring fundamental hardware characteristics.',
    test: 'Microbenchmark',
    testTooltip: 'The ubenchX microbenchmark to display.',
    memBwTitle: 'Device-Memory Copy Bandwidth',
    smL2Title: 'SM-SM L2 Latency Difference',
  },
  zh: {
    title: 'ubenchX 微基准测试（Beta）',
    subtitle: '底层 GPU 微基准测试，测量基础硬件特性。',
    test: '微基准测试',
    testTooltip: '要显示的 ubenchX 微基准测试。',
    memBwTitle: '显存拷贝带宽',
    smL2Title: 'SM 间 L2 延迟差异',
  },
} as const;

export const UBENCHX_TESTS = [
  { slug: 'mem-bw', titleKey: 'memBwTitle' },
  { slug: 'sm-l2-distance', titleKey: 'smL2Title' },
] as const;

export type UbenchxTestSlug = (typeof UBENCHX_TESTS)[number]['slug'];

/** Shared ubenchX page header: title plus a selector that switches between test views. */
export function UbenchxHub({ current }: { current: UbenchxTestSlug }) {
  const locale = useLocale();
  const router = useRouter();
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
      </div>
      <div className="flex flex-col space-y-1.5 sm:w-[320px]">
        <LabelWithTooltip htmlFor="ubenchx-test-select" label={t.test} tooltip={t.testTooltip} />
        <Select
          value={current}
          onValueChange={(value) => {
            if (value === current) return;
            track('ubenchx_test_selected', { test: value });
            router.push(`${prefix}/ubenchx/${value}`);
          }}
        >
          <SelectTrigger id="ubenchx-test-select" data-testid="ubenchx-test-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UBENCHX_TESTS.map((test) => (
              <SelectItem key={test.slug} value={test.slug}>
                {t[test.titleKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
