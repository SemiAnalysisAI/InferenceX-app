// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorReachPanel } from '@/components/agentic-workload-explorer/error-reach';
import type { ErrorReach, ErrorReachCohort } from '@/lib/agentic-workload-explorer/api-types';

const OVERALL: ErrorReachCohort = {
  client: '(all)',
  requestCount: 10_000,
  errorCount: 100,
  requestErrorRate: 0.01,
  sessionCount: 500,
  affectedSessionCount: 50,
  affectedSessionRate: 0.1,
  repeatErrorSessionCount: 20,
  repeatErrorCount: 70,
  repeatErrorShare: 0.7,
  avgErrorsPerAffectedSession: 2,
  p50ErrorsPerAffectedSession: 1,
  p90ErrorsPerAffectedSession: 4,
  maxErrorsInSession: 20,
  topSessionErrorShare: 0.2,
  topTenErrorShare: 0.6,
};

const DATA: ErrorReach = {
  windowDays: 30,
  overall: OVERALL,
  byClient: [
    { ...OVERALL, client: 'anthropic' },
    {
      ...OVERALL,
      client: 'codex',
      requestCount: 2000,
      errorCount: 50,
      requestErrorRate: 0.025,
      affectedSessionCount: 10,
      affectedSessionRate: 0.02,
      avgErrorsPerAffectedSession: 5,
      p90ErrorsPerAffectedSession: 9,
      repeatErrorShare: 0.9,
      topTenErrorShare: 0.8,
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

describe('ErrorReachPanel', () => {
  it('shows both affected-session reach and retry concentration', () => {
    act(() => root.render(<ErrorReachPanel data={DATA} />));

    expect(container.textContent).toContain('Rolling 30 days');
    expect(container.textContent).toContain('1.00%');
    expect(container.textContent).toContain('50 / 500 sessions');
    expect(container.textContent).toContain('70.0%');
    expect(container.textContent).toContain('60.0%');

    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual(['Anthropic', 'Codex']);
    expect(rows[1].textContent).toContain('2.50%');
    expect(rows[1].textContent).toContain('90.0%');
    expect(rows[1].textContent).toContain('80.0%');
  });

  it('handles an empty recent window', () => {
    act(() =>
      root.render(<ErrorReachPanel data={{ windowDays: 30, overall: null, byClient: [] }} />),
    );
    expect(container.textContent).toContain('No requests in the latest 30 days.');
  });
});
