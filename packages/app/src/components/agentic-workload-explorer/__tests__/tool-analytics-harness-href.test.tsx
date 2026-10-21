// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolAnalyticsPage from '@/components/agentic-workload-explorer/views/tool-analytics-view';
import { EXPLORER_BASE_PATH } from '@/lib/agentic-workload-explorer/paths';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
  pathname: '/agentic-workload-explorer/tool-analytics',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.search,
  usePathname: () => mocks.pathname,
}));

const EMPTY_ANALYTICS = { warming: true } as const;
const EMPTY_WORKFLOWS = {
  warming: true,
  totalSessions: 0,
  totalCalls: 0,
  collapsedSteps: 0,
  repeatShare: 0,
  longestStreak: null,
  motifs: [],
  streaks: [],
  loops: [],
} as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(
        Response.json(url.includes('/sequences') ? EMPTY_WORKFLOWS : EMPTY_ANALYTICS),
      );
    }),
  );
  mocks.replace.mockReset();
  mocks.search = new URLSearchParams();
  mocks.pathname = `${EXPLORER_BASE_PATH}/tool-analytics`;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function harnessButton(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Expected a harness filter button labelled “${label}”`);
  return match;
}

async function render() {
  act(() => root.render(<ToolAnalyticsPage />));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickHarness(label: string) {
  await act(async () => {
    harnessButton(label).click();
    await Promise.resolve();
  });
}

describe('tool analytics harness filter navigation', () => {
  it('keeps the explorer path prefix so the filter does not land on the 404 page', async () => {
    await render();
    await clickHarness('Claude Code');

    expect(mocks.replace).toHaveBeenCalledWith(
      `${EXPLORER_BASE_PATH}/tool-analytics?harness=claude-code`,
      { scroll: false },
    );
  });

  it('clears the query for "All Harnesses" without leaving the explorer', async () => {
    mocks.search = new URLSearchParams('harness=codex');
    await render();
    await clickHarness('All Harnesses');

    expect(mocks.replace).toHaveBeenCalledWith(`${EXPLORER_BASE_PATH}/tool-analytics`, {
      scroll: false,
    });
  });

  it('keeps a /zh reader on the Chinese page', async () => {
    mocks.pathname = `/zh${EXPLORER_BASE_PATH}/tool-analytics`;
    await render();
    await clickHarness('Codex');

    expect(mocks.replace).toHaveBeenCalledWith(
      `/zh${EXPLORER_BASE_PATH}/tool-analytics?harness=codex`,
      { scroll: false },
    );
  });

  it('carries the global trace-version filter through', async () => {
    mocks.search = new URLSearchParams('version=7');
    await render();
    await clickHarness('Codex');

    expect(mocks.replace).toHaveBeenCalledWith(
      `${EXPLORER_BASE_PATH}/tool-analytics?version=7&harness=codex`,
      { scroll: false },
    );
  });
});
