import type { QuickFilters } from '../types';
import { FRAMEWORK_FAMILIES } from './quickFilters';

const LABELS = {
  en: {
    vendors: 'Vendor',
    frameworks: 'Framework',
    deployment: 'Deployment',
    spec: 'Spec Decoding',
    power: 'Measured Power',
    'single-node': 'Single-node',
    'multi-node': 'Multi-node',
    disagg: 'Disaggregated',
    certified: 'Validated',
    legacy: 'Historical',
    mtp: 'MTP',
    stp: 'STP',
  },
  zh: {
    vendors: '厂商',
    frameworks: '框架',
    deployment: '部署模式',
    spec: '投机解码',
    power: '实测功耗',
    'single-node': '单节点',
    'multi-node': '多节点聚合',
    disagg: '分离式',
    certified: '已验证',
    legacy: '历史测量',
    mtp: 'MTP',
    stp: 'STP',
  },
} as const;

/** Summarize actual filters, including stale/unknown values so they remain removable. */
export function quickFilterSummary(filters: QuickFilters, locale: 'en' | 'zh', agentic = false) {
  const labels = LABELS[locale];
  return (Object.keys(filters) as (keyof QuickFilters)[]).flatMap((category) => {
    if (agentic && category === 'spec') return [];
    return filters[category].map((value) => ({
      category,
      value,
      categoryLabel: labels[category],
      label:
        category === 'frameworks'
          ? (FRAMEWORK_FAMILIES.find((family) => family.key === value)?.label ?? value)
          : (labels[value as keyof typeof labels] ?? value),
    }));
  });
}
