import type { ChartDefinition, CostDisplayMode } from './types';

export type { CostDisplayMode } from './types';

export const DEFAULT_COST_DISPLAY_MODE: CostDisplayMode = 'tokens-per-dollar';

type TokenKind = 'total' | 'output' | 'input';

const COST_METRICS: Record<string, { kind: TokenKind; suffixEn: string; suffixZh: string }> = {
  y_costh: {
    kind: 'total',
    suffixEn: 'Owning - Hyperscaler',
    suffixZh: '自有 - 超大规模',
  },
  y_costn: {
    kind: 'total',
    suffixEn: 'Owning - Neocloud Giant',
    suffixZh: '自有 - Neocloud Giant',
  },
  y_costr: { kind: 'total', suffixEn: '3 Year Rental', suffixZh: '3 年租赁' },
  y_costhOutput: {
    kind: 'output',
    suffixEn: 'Owning - Hyperscaler',
    suffixZh: '自有 - 超大规模',
  },
  y_costnOutput: {
    kind: 'output',
    suffixEn: 'Owning - Neocloud Giant',
    suffixZh: '自有 - Neocloud Giant',
  },
  y_costrOutput: { kind: 'output', suffixEn: '3 Year Rental', suffixZh: '3 年租赁' },
  y_costhi: {
    kind: 'input',
    suffixEn: 'Owning - Hyperscaler',
    suffixZh: '自有 - 超大规模',
  },
  y_costni: {
    kind: 'input',
    suffixEn: 'Owning - Neocloud Giant',
    suffixZh: '自有 - Neocloud Giant',
  },
  y_costri: { kind: 'input', suffixEn: '3 Year Rental', suffixZh: '3 年租赁' },
  y_costUser: { kind: 'total', suffixEn: 'Custom User Values', suffixZh: '自定义值' },
};

const TOKEN_KIND_LABELS = {
  total: { en: 'Total', zh: '总' },
  output: { en: 'Output', zh: '输出' },
  input: { en: 'Input', zh: '输入' },
} as const;

export function isTokenCostMetric(metric: string): boolean {
  return metric in COST_METRICS;
}

export function parseCostDisplayMode(value: string | null | undefined): CostDisplayMode {
  return value === 'cost-per-million' ? value : DEFAULT_COST_DISPLAY_MODE;
}

/** Stored cost fields are tokens/$; the alternate view is their exact reciprocal. */
export function displayTokenCostValue(tokensPerDollar: number, mode: CostDisplayMode): number {
  if (mode === 'tokens-per-dollar') return tokensPerDollar;
  return tokensPerDollar > 0 ? 1_000_000 / tokensPerDollar : 0;
}

/** Neutral option title used in the Y-axis dropdown; display units live in their own control. */
export function tokenCostMetricTitle(metric: string, locale: 'en' | 'zh'): string | undefined {
  const config = COST_METRICS[metric];
  if (!config) return undefined;
  const kind = TOKEN_KIND_LABELS[config.kind][locale];
  const suffix = locale === 'zh' ? config.suffixZh : config.suffixEn;
  return locale === 'zh' ? `${kind} token 成本（${suffix}）` : `${kind} Token Cost (${suffix})`;
}

function invertMetricDirection(direction: string | undefined): string | undefined {
  if (direction === 'upper_left') return 'lower_right';
  if (direction === 'upper_right') return 'lower_left';
  return direction;
}

/**
 * Override the selected cost axis's copy and Pareto direction for its display unit.
 * The JSON config remains the tokens/$ default so existing metric keys and URLs stay stable.
 */
export function applyCostDisplayToChartDefinition(
  chartDef: ChartDefinition,
  metric: string,
  mode: CostDisplayMode,
): ChartDefinition {
  const config = COST_METRICS[metric];
  if (!config || mode === 'tokens-per-dollar') return chartDef;

  const kindEn = TOKEN_KIND_LABELS[config.kind].en;
  const kindZh = TOKEN_KIND_LABELS[config.kind].zh;
  const rooflineKey = `${metric}_roofline`;

  return {
    ...chartDef,
    [`${metric}_label`]: `Cost per Million ${kindEn} Tokens ($/M tok)`,
    [`${metric}_labelZh`]: `每百万${kindZh} token 成本（$/M tok）`,
    [`${metric}_title`]: `Cost per Million ${kindEn} Tokens (${config.suffixEn})`,
    [`${metric}_titleZh`]: `每百万${kindZh} token 成本（${config.suffixZh}）`,
    [rooflineKey]: invertMetricDirection(chartDef[rooflineKey] as string | undefined),
    // Preserve the original cost chart's readable domain. Tokens/$ has no
    // corresponding upper clamp because larger purchasing power is desirable.
    y_cost_limit: 5,
  };
}
