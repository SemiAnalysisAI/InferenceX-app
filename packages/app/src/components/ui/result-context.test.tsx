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
  it('renders all effective result inputs in English', () => {
    const context = renderContext('en');
    expect(context.querySelector('[data-testid="result-context"]')?.textContent).toContain(
      'Model: DeepSeek-R1-0528',
    );
    expect(context.textContent).toContain('Date range: 2026-08-01 → 2026-08-31');
    expect(context.textContent).toContain('Source: SemiAnalysis InferenceX™');
    expect(context.textContent).not.toContain('Source: Source:');
    expect(context.textContent).toContain('Cost basis: Input $1/M tok · Output $8/M tok');
  });

  it('localizes labels while preserving technical values', () => {
    const context = renderContext('zh');
    expect(context.textContent).toContain('模型: DeepSeek-R1-0528');
    expect(context.textContent).toContain('日期范围: 2026-08-01 → 2026-08-31');
    expect(context.textContent).toContain('成本口径: Input $1/M tok · Output $8/M tok');
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
    expect(container.textContent).toContain('Dates: 2026-08-01, 2026-08-15, 2026-08-31');
    expect(container.textContent).not.toContain('Updated: 2026-08-31');
  });
});
