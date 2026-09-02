import { describe, expect, it } from 'vitest';
import { quickFilterSummary } from './quick-filter-summary';
import { EMPTY_QUICK_FILTERS } from './quickFilters';

describe('quickFilterSummary', () => {
  it('keeps stale framework values removable and translates labels without changing values', () => {
    const result = quickFilterSummary(
      {
        ...EMPTY_QUICK_FILTERS,
        frameworks: ['vllm', 'retired-engine'],
        deployment: ['multi-node'],
        power: ['certified'],
      },
      'zh',
    );
    expect(result).toEqual([
      { category: 'frameworks', value: 'vllm', categoryLabel: '框架', label: 'vLLM' },
      {
        category: 'frameworks',
        value: 'retired-engine',
        categoryLabel: '框架',
        label: 'retired-engine',
      },
      {
        category: 'deployment',
        value: 'multi-node',
        categoryLabel: '部署模式',
        label: '多节点聚合',
      },
      { category: 'power', value: 'certified', categoryLabel: '实测功耗', label: '已验证' },
    ]);
  });
  it('omits inapplicable spec filters for AgentX but retains every other selected value', () => {
    const filters = { ...EMPTY_QUICK_FILTERS, vendors: ['NVIDIA', 'AMD'], spec: ['mtp' as const] };
    expect(quickFilterSummary(filters, 'en', true).map((item) => item.value)).toEqual([
      'NVIDIA',
      'AMD',
    ]);
    expect(quickFilterSummary(filters, 'en').map((item) => item.value)).toEqual([
      'NVIDIA',
      'AMD',
      'mtp',
    ]);
    expect(filters.spec).toEqual(['mtp']);
  });
});
