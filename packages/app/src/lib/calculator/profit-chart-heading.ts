import type { Locale } from '@/lib/i18n/i18n';

type ProfitHeadingBasis = 'chip-hour' | 'gw-year';

const HEADINGS = {
  en: {
    title: {
      'gw-year': (model: string, workload: string) =>
        `${model} ${workload} revenue & profit estimates per gigawatt per year`,
      'chip-hour': (model: string, workload: string) =>
        `${model} ${workload} revenue & profit estimates per chip per hour`,
    },
    qualifier: (percentile: string, target: number) =>
      `at ${percentile} ${target} tok/s/user interactivity`,
  },
  zh: {
    title: {
      'gw-year': (model: string, workload: string) =>
        `${model} ${workload} 每吉瓦每年收入与利润估算`,
      'chip-hour': (model: string, workload: string) =>
        `${model} ${workload} 每芯片每小时收入与利润估算`,
    },
    qualifier: (percentile: string, target: number) =>
      `（${percentile} 交互性 ${target} tok/s/user）`,
  },
} as const;

export function profitChartTitle(
  locale: Locale,
  basis: ProfitHeadingBasis,
  model: string,
  workload: string,
): string {
  return HEADINGS[locale].title[basis](model, workload);
}

export function profitChartQualifier(locale: Locale, percentile: string, target: number): string {
  return HEADINGS[locale].qualifier(percentile, target);
}
