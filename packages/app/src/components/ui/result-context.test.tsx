// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { ResultContext } from './result-context';

function renderContext(locale: 'en' | 'zh') {
  const container = document.createElement('div');
  act(() => {
    createRoot(container).render(
      <ResultContext
        locale={locale}
        model="DeepSeek-R1-0528"
        workload="8k/1k"
        precision="FP4"
        metric="Throughput (tok/s/chip)"
        target="35 tok/s/user"
        dateRange={{ start: '2026-08-01', end: '2026-08-31' }}
        source="SemiAnalysis InferenceX™"
        costBasis="Input $1/M tok · Output $8/M tok"
      />,
    );
  });
  return container;
}

describe('ResultContext', () => {
  it.each([
    ['en', 'SemiAnalysis InferenceX™', 'Source: SemiAnalysis InferenceX™ (Deprecated)'],
    ['zh', 'SemiAnalysis InferenceX™', '来源: SemiAnalysis InferenceX™ (已弃用)'],
    [
      'en',
      'SemiAnalysis InferenceX™ + UNOFFICIAL overlays',
      'Source: SemiAnalysis InferenceX™ + UNOFFICIAL overlays (Deprecated)',
    ],
    [
      'zh',
      'SemiAnalysis InferenceX™ + 非官方 overlays',
      '来源: SemiAnalysis InferenceX™ + 非官方 overlays (已弃用)',
    ],
  ] as const)('appends the deprecated status to the %s source %s', (locale, source, expected) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ResultContext locale={locale} source={source} deprecated />));
    expect(container.textContent).toBe(expected);
    act(() => root.render(<ResultContext locale={locale} source={source} deprecated={false} />));
    expect(container.textContent).toBe(`${locale === 'zh' ? '来源' : 'Source'}: ${source}`);
    act(() => root.unmount());
  });

  it('does not render an orphan deprecated label without a source', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ResultContext locale="en" deprecated />));
    expect(container.textContent).toBe('');
    act(() => root.unmount());
  });

  it('renders all effective result inputs in English', () => {
    const context = renderContext('en');
    expect(context.querySelector('[data-testid="result-context"]')?.textContent).toContain(
      'Model: DeepSeek-R1-0528',
    );
    expect(context.textContent).toContain('Date range: Aug 1, 2026 → Aug 31, 2026');
    expect(context.textContent).toContain('Source: SemiAnalysis InferenceX™');
    expect(context.textContent).not.toContain('Source: Source:');
    expect(context.textContent).toContain('Cost basis: Input $1/M tok · Output $8/M tok');
  });

  it('localizes labels while preserving technical values', () => {
    const context = renderContext('zh');
    expect(context.textContent).toContain('模型: DeepSeek-R1-0528');
    expect(context.textContent).toContain('日期范围: 2026年8月1日 → 2026年8月31日');
    expect(context.textContent).toContain('成本口径: Input $1/M tok · Output $8/M tok');
  });

  it('keeps precision with Cost Tier, Updated, and Source when the heading carries other identity', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext
          locale="en"
          precision="FP8"
          costTier="Owning at large hyperscaler volume"
          date="2026-09-01"
          source="SemiAnalysis InferenceX™"
        />,
      );
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Precision: FP8');
    expect(text).toContain('Cost tier: Owning at large hyperscaler volume');
    expect(text).toContain('Updated: Sep 1, 2026');
    expect(text).toContain('Source: SemiAnalysis InferenceX™');
    expect(text).not.toContain('Model:');
    expect(text).not.toContain('Workload:');
    expect(text).not.toContain('Metric:');
    expect(container.querySelector('[data-testid="result-context-cost-tier"]')?.textContent).toBe(
      'Owning at large hyperscaler volume',
    );
  });

  it('hosts an inline Cost Tier control and keeps a plain-text twin for PNG export', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext
          locale="en"
          costTier="Rent – 3-year commit"
          costTierControl={<button data-testid="tier-control">Rent – 3-year commit</button>}
          date="2026-09-01"
        />,
      );
    });
    const dd = container.querySelector('[data-testid="result-context-cost-tier"]');
    expect(container.textContent).toContain('Cost tier:');
    expect(dd?.querySelector('.no-export [data-testid="tier-control"]')).not.toBeNull();
    expect(dd?.querySelector('.export-only')?.textContent).toBe('Rent – 3-year commit');
    expect(dd?.querySelector('.export-only')?.classList.contains('hidden')).toBe(true);
    expect(container.textContent).toContain('Updated: Sep 1, 2026');
  });

  it('lays out the chart footer as a controls row and one meta line', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext
          locale="en"
          layout="footer"
          costTier="Rent – 3-year commit"
          costTierControl={<button data-testid="tier-control">Rent – 3-year commit</button>}
          date="2026-09-01"
          source="SemiAnalysis InferenceX™"
          controlsEnd={<table data-testid="prices" />}
          markers={<span>KV offload on</span>}
          metaEnd={<span>Prices: model</span>}
        />,
      );
    });
    const dt = container.querySelector('[data-testid="result-context-cost-tier"]')?.previousSibling
      ?.previousSibling as HTMLElement;
    expect(dt.querySelector('.sr-only')?.textContent).toBe('Cost tier');
    expect(dt.querySelector('.export-only.hidden')?.textContent).toBe('Cost tier:');
    expect(container.querySelector('[data-testid="prices"]')).not.toBeNull();
    expect(container.textContent).toContain('Updated Sep 1, 2026');
    expect(container.querySelector('[data-testid="result-context-markers"]')?.textContent).toBe(
      'KV offload on',
    );
    expect(container.textContent).toContain('Prices: model');
  });

  it('puts the scenario first and the chip basis last on the footer controls row', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext
          locale="en"
          layout="footer"
          scenario={<div data-testid="scenario-slot" />}
          tcoBasis={<div data-testid="tco-slot" />}
          chipBasis={<div data-testid="chip-slot" />}
          date="2026-09-01"
        />,
      );
    });
    const row = container.querySelector('[data-testid="scenario-slot"]')?.parentElement;
    expect(
      [...(row?.children ?? [])].map((child) => (child as HTMLElement).dataset.testid),
    ).toEqual(['scenario-slot', 'tco-slot', 'chip-slot']);
    expect(container.textContent).toContain('Updated Sep 1, 2026');
  });

  it('shows utilization and the model license fee when given, in both locales', () => {
    const en = document.createElement('div');
    act(() => {
      createRoot(en).render(<ResultContext locale="en" utilization="60%" licenseFee="30%" />);
    });
    expect(en.textContent).toContain('Utilization: 60%');
    expect(en.textContent).toContain('Model license fee assumption: 30%');
    expect(en.querySelector('[data-testid="result-context-license-fee"]')?.textContent).toBe('30%');
    const zh = document.createElement('div');
    act(() => {
      createRoot(zh).render(<ResultContext locale="zh" utilization="60%" licenseFee="30%" />);
    });
    expect(zh.textContent).toContain('利用率: 60%');
    expect(zh.textContent).toContain('模型许可费假设: 30%');
  });

  it('renders inline editors for utilization and the license fee with export twins', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext
          locale="en"
          utilization="60%"
          utilizationControl={<input id="util" data-testid="util-control" defaultValue="60" />}
          utilizationControlId="util"
          licenseFee="30%"
          licenseFeeControl={<input id="fee" data-testid="fee-control" defaultValue="30" />}
          licenseFeeControlId="fee"
        />,
      );
    });
    expect(container.querySelector('label[for="util"]')?.textContent).toBe('Utilization:');
    expect(container.querySelector('label[for="fee"]')?.textContent).toBe(
      'Model license fee assumption:',
    );
    const util = container.querySelector('[data-testid="result-context-utilization"]');
    expect(util?.querySelector('.no-export [data-testid="util-control"]')).not.toBeNull();
    expect(util?.querySelector('.export-only')?.textContent).toBe('60%');
    expect(util?.textContent).toBe('60%');
    const fee = container.querySelector('[data-testid="result-context-license-fee"]');
    expect(fee?.querySelector('.no-export [data-testid="fee-control"]')).not.toBeNull();
    expect(fee?.querySelector('.export-only')?.classList.contains('hidden')).toBe(true);
    expect(container.textContent).toContain('Utilization: 60%');
  });

  it('localizes the Cost Tier label', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext locale="zh" costTier="自有 · 超大规模云厂商批量采购" date="2026-09-01" />,
      );
    });
    expect(container.textContent).toContain('成本层级: 自有 · 超大规模云厂商批量采购');
    expect(container.textContent).not.toContain('模型:');
  });

  it('does not imply a single date when several dates are selected', () => {
    const container = document.createElement('div');
    act(() => {
      createRoot(container).render(
        <ResultContext
          locale="en"
          model="Model"
          workload="8k/1k"
          metric="Throughput"
          date="2026-08-31"
          dates={['2026-08-01', '2026-08-15', '2026-08-31']}
        />,
      );
    });
    expect(container.textContent).toContain('Dates: Aug 1, 2026, Aug 15, 2026, Aug 31, 2026');
    expect(container.textContent).not.toContain('Updated: Aug 31, 2026');
  });
});
