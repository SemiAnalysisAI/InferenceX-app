'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { ControlPanel } from '@/components/ui/control-panel';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Eyebrow } from '@/components/ui/eyebrow';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    title: 'ubenchX microbenchmarks',
    eyebrow: 'ubenchX · Beta',
    subtitle:
      'Low-level accelerator microbenchmarks measuring fundamental hardware characteristics',
    controls: 'Benchmark config',
    test: 'Microbenchmark',
    testTooltip: 'The ubenchX microbenchmark to display.',
    memBwTitle: 'HBM bandwidth',
    tpcSkylineTitle: 'TPC Skyline & SKU configurations',
    coreProfilesTitle: 'Core memory-access profiles',
  },
  zh: {
    title: 'ubenchX 微基准测试',
    eyebrow: 'ubenchX · 测试版',
    subtitle: '底层加速器微基准测试，测量基础硬件特性',
    controls: '基准测试配置',
    test: '微基准测试',
    testTooltip: '要显示的 ubenchX 微基准测试。',
    memBwTitle: 'HBM 带宽',
    tpcSkylineTitle: 'TPC Skyline 与 SKU 配置',
    coreProfilesTitle: '核心访存特征',
  },
} as const;

export const UBENCHX_TESTS = [
  { slug: 'mem-bw', titleKey: 'memBwTitle' },
  { slug: 'tpc-skyline', titleKey: 'tpcSkylineTitle' },
  { slug: 'core-memory-profiles', titleKey: 'coreProfilesTitle' },
] as const;

export type UbenchxTestSlug = (typeof UBENCHX_TESTS)[number]['slug'];

export function UbenchxHub({
  current,
  controls,
}: {
  current: UbenchxTestSlug;
  controls?: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <section>
      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <Eyebrow as="p" className="mb-1" data-testid="ubenchx-maturity">
              {t.eyebrow}
            </Eyebrow>
            <DashboardSectionHeader headingAs="h1" title={t.title} description={t.subtitle} />
          </div>
          <ControlPanel legend={t.controls}>
            <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col space-y-1.5">
                <LabelWithTooltip
                  htmlFor="ubenchx-test-select"
                  label={t.test}
                  tooltip={t.testTooltip}
                />
                <Select
                  value={current}
                  onValueChange={(value) => {
                    if (value === current) return;
                    track('ubenchx_test_selected', { test: value });
                    router.push(`${prefix}/ubenchx/${value}`);
                  }}
                >
                  <SelectTrigger
                    id="ubenchx-test-select"
                    data-testid="ubenchx-test-select"
                    className="w-full"
                  >
                    <SelectValue>
                      {t[UBENCHX_TESTS.find((test) => test.slug === current)!.titleKey]}
                    </SelectValue>
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
              {controls}
            </div>
          </ControlPanel>
        </div>
      </Card>
    </section>
  );
}
