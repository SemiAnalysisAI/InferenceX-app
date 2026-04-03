const TAB_LINKS = [
  { href: '/inference', label: 'Inference Performance', testId: 'tab-trigger-inference' },
  { href: '/evaluation', label: 'Accuracy Evals', testId: 'tab-trigger-evaluation' },
  { href: '/historical', label: 'Historical Trends', testId: 'tab-trigger-historical' },
  { href: '/calculator', label: 'TCO Calculator', testId: 'tab-trigger-calculator' },
  { href: '/gpu-specs', label: 'GPU Specs', testId: 'tab-trigger-gpu-specs' },
  { href: '/gpu-metrics', label: 'PowerX', testId: 'tab-trigger-gpu-metrics', gated: true },
  { href: '/submissions', label: 'Submissions', testId: 'tab-trigger-submissions', gated: true },
] as const;

type TabLinkValue = (typeof TAB_LINKS)[number]['href'] extends `/${infer Value}` ? Value : never;

const TAB_LINK_VALUES = new Set(TAB_LINKS.map((tab) => tab.href.slice(1)));

function isTabLinkValue(value: string): value is TabLinkValue {
  return TAB_LINK_VALUES.has(value);
}

export { TAB_LINKS, isTabLinkValue };
export type { TabLinkValue };
