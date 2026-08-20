import { describe, expect, it } from 'vitest';

import { DASHBOARD_ROUTE_KEYS } from './dashboard-routes';
import { getTabTitle, isValidTab, LANDING_META, TAB_META, tabMetadata } from './tab-meta';

describe('agentic inference positioning', () => {
  it('uses agentic inference for the category and AgentX for the scenario', () => {
    expect(LANDING_META.title).toContain('Agentic Inference Benchmark');
    expect(LANDING_META.title).not.toContain('AgentX');
    expect(LANDING_META.description).toMatch(/AgentX.*scenario/u);
    expect(LANDING_META.description).toContain('fixed-sequence');
    expect(TAB_META.inference.title).toContain('Agentic Inference');
    expect(TAB_META.inference.title).not.toContain('AgentX');
    expect(TAB_META.inference.description).toMatch(/AgentX.*workload/u);
    expect(TAB_META.inference.description).toContain('fixed-sequence');
  });
});

describe('current image metadata', () => {
  it('uses the canonical tab copy and bilingual alternates', () => {
    const meta = tabMetadata('current-inferencex-image');
    expect(meta.description).toBe(TAB_META['current-inferencex-image'].description);
    expect(meta.openGraph?.description).toBe(TAB_META['current-inferencex-image'].description);
    expect(meta.alternates?.languages).toBeDefined();
  });
});

describe('isValidTab', () => {
  it.each(DASHBOARD_ROUTE_KEYS)('returns true for valid tab "%s"', (tab) => {
    expect(isValidTab(tab)).toBe(true);
  });

  it.each(['', 'nonexistent', 'Inference', 'INFERENCE', 'gpu_specs', 'tabs'])(
    'returns false for invalid tab "%s"',
    (tab) => {
      expect(isValidTab(tab)).toBe(false);
    },
  );
});

describe('getTabTitle', () => {
  it.each(DASHBOARD_ROUTE_KEYS)('returns formatted title for "%s"', (tab) => {
    const title = getTabTitle(tab);
    expect(title).toContain(TAB_META[tab].title);
    expect(title).toContain('|');
  });

  it('returns fallback title for invalid tab', () => {
    const title = getTabTitle('nonexistent');
    expect(title).not.toContain('|');
    expect(title.length).toBeGreaterThan(0);
  });
});
