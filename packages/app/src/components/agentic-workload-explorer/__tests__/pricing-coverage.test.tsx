// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingCoverageCard } from '@/components/agentic-workload-explorer/pricing-coverage';
import type { PricingCoverage } from '@/lib/agentic-workload-explorer/api-types';

const COVERAGE: PricingCoverage = {
  windowDays: 7,
  usageRequestCount: 1000,
  pricedRequestCount: 980,
  unpricedRequestCount: 20,
  requestCoverage: 0.98,
  inputSideTokens: 1_000_000,
  pricedInputSideTokens: 990_000,
  inputSideTokenCoverage: 0.99,
  outputTokens: 100_000,
  pricedOutputTokens: 95_000,
  outputTokenCoverage: 0.95,
  byModel: [
    {
      model: 'new-model',
      requestCount: 20,
      inputTokens: 2000,
      cacheReadInputTokens: 7000,
      cacheWriteTokens: 1000,
      outputTokens: 5000,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('PricingCoverageCard', () => {
  it('shows request and token coverage with unpriced models', () => {
    act(() => root.render(<PricingCoverageCard coverage={COVERAGE} />));

    expect(container.textContent).toContain('Latest 7 days');
    expect(container.textContent).toContain('98.00%');
    expect(container.textContent).toContain('99.00%');
    expect(container.textContent).toContain('95.00%');
    expect(container.textContent).toContain('new-model');
    expect(container.textContent).toContain('7.0K');
    expect(container.querySelector('[aria-label="Unpriced model usage"]')).not.toBeNull();
  });

  it('shows a healthy state when every usage-bearing request is priced', () => {
    act(() =>
      root.render(
        <PricingCoverageCard
          coverage={{
            ...COVERAGE,
            pricedRequestCount: COVERAGE.usageRequestCount,
            unpricedRequestCount: 0,
            requestCoverage: 1,
            inputSideTokenCoverage: 1,
            outputTokenCoverage: 1,
            byModel: [],
          }}
        />,
      ),
    );

    expect(container.textContent).toContain('All usage-bearing model IDs have cost estimates.');
    expect(container.querySelector('table')).toBeNull();
  });
});
