import type { ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { Locale } from '@/lib/i18n/i18n';

export {
  sliceKey,
  slices,
  rankedSlices,
} from '@semianalysisai/inferencex-db/operatorx/visualization';

export const SIZE_BUCKETS: { label: string; max: number }[] = [
  { label: '1', max: 1 },
  { label: '2–16', max: 16 },
  { label: '17–128', max: 128 },
  { label: '129–1024', max: 1024 },
  { label: '1025–8192', max: 8192 },
  { label: '>8192', max: Infinity },
];

export function sizeBucket(x: number | null): string | null {
  if (x === null) return null;
  return SIZE_BUCKETS.find((b) => x <= b.max)?.label ?? null;
}

export function caseOrigin(
  view: ComparisonView,
  i: number,
  locale: Locale,
): { label: string; value: string }[] {
  const c = view.cases[i];
  if (c.sources.length === 0)
    return [{ label: locale === 'zh' ? '测试列表' : 'Testlist', value: c.testlist }];
  return c.sources.map((s) => ({ label: view.models[s.model], value: s.roles.join(', ') }));
}

export function originText(view: ComparisonView, i: number, locale: Locale): string {
  return caseOrigin(view, i, locale)
    .map((o) => `${o.label} ${o.value}`)
    .join(' · ');
}
