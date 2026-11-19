// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ToolOsErrorRates,
  type ToolOsErrorRate,
} from '@/components/agentic-workload-explorer/tool-os-error-rates';

const ROWS: ToolOsErrorRate[] = [
  {
    os: 'Linux',
    allCalls: 16,
    allMatchedResults: 14,
    comparableCalls: 12,
    matchedResults: 10,
    successes: 9,
    errors: 1,
    unknown: 2,
    errorRate: 0.1,
    providers: [
      {
        client: 'anthropic',
        totalCalls: 12,
        matchedResults: 10,
        supportsExplicitErrors: true,
      },
      {
        client: 'codex',
        totalCalls: 4,
        matchedResults: 4,
        supportsExplicitErrors: false,
      },
    ],
  },
  {
    os: 'Unknown',
    allCalls: 3,
    allMatchedResults: 0,
    comparableCalls: 0,
    matchedResults: 0,
    successes: 0,
    errors: 0,
    unknown: 0,
    errorRate: null,
    providers: [
      {
        client: 'openai',
        totalCalls: 3,
        matchedResults: 0,
        supportsExplicitErrors: false,
      },
    ],
  },
  {
    os: 'MacOS',
    allCalls: 15,
    allMatchedResults: 15,
    comparableCalls: 10,
    matchedResults: 10,
    successes: 8,
    errors: 2,
    unknown: 0,
    errorRate: 0.2,
    providers: [
      {
        client: 'anthropic',
        totalCalls: 10,
        matchedResults: 10,
        supportsExplicitErrors: true,
      },
      {
        client: 'codex',
        totalCalls: 5,
        matchedResults: 5,
        supportsExplicitErrors: false,
      },
    ],
  },
  {
    os: 'Windows',
    allCalls: 8,
    allMatchedResults: 8,
    comparableCalls: 8,
    matchedResults: 8,
    successes: 4,
    errors: 4,
    unknown: 0,
    errorRate: 0.5,
    providers: [
      {
        client: 'anthropic',
        totalCalls: 8,
        matchedResults: 8,
        supportsExplicitErrors: true,
      },
    ],
  },
];

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

describe('ToolOsErrorRates', () => {
  it('shows comparable error percentages and provider mix in dashboard OS order', () => {
    act(() => root.render(<ToolOsErrorRates rows={ROWS} />));

    const renderedRows = [...container.querySelectorAll('tbody tr')];
    expect(renderedRows.map((row) => row.querySelector('th')?.textContent)).toEqual([
      'MacOS',
      'Windows',
      'Linux',
      'Unknown',
    ]);
    expect(renderedRows.map((row) => row.querySelector('td:nth-child(8)')?.textContent)).toEqual([
      '20.0%',
      '50.0%',
      '10.0%',
      '—',
    ]);
    expect(renderedRows.map((row) => row.querySelector('td:nth-child(5)')?.textContent)).toEqual([
      '100.0%',
      '100.0%',
      '83.3%',
      '—',
    ]);
    expect(renderedRows.map((row) => row.querySelector('td:nth-child(6)')?.textContent)).toEqual([
      '66.7%',
      '100.0%',
      '71.4%',
      '—',
    ]);
    expect(container.textContent).toContain('28 comparable results');
    expect(container.textContent).toContain('Anthropic 66.7%');
    expect(container.textContent).toContain('Codex 33.3%');
    expect(container.textContent).toContain('OpenAI 100.0%');
  });
});
