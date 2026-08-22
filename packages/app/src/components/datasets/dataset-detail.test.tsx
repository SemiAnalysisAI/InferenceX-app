// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { conversationQueries } = vi.hoisted(() => ({
  conversationQueries: [] as {
    slug: string | null;
    search?: string;
    limit?: number;
    offset?: number;
    sort?: string;
  }[],
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: PropsWithChildren<{ href: string }>) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: PropsWithChildren) => createElement('div', null, children),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: PropsWithChildren) => createElement('div', null, children),
  SelectContent: ({ children }: PropsWithChildren) => createElement('div', null, children),
  SelectItem: ({ children }: PropsWithChildren) => createElement('div', null, children),
  SelectTrigger: ({ children }: PropsWithChildren) => createElement('div', null, children),
  SelectValue: () => null,
}));
vi.mock('@/components/datasets/distribution-card', () => ({ DistributionCard: () => null }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/hooks/api/use-datasets', () => ({
  useDataset: () => ({
    data: {
      slug: 'trace',
      label: 'Trace dataset',
      variant: 'test',
      conversation_count: 100,
      summary: {},
      chart_data: {},
    },
    isLoading: false,
    isError: false,
  }),
  useDatasetConversations: (args: (typeof conversationQueries)[number]) => {
    conversationQueries.push({ ...args });
    return { data: { total: 100, items: [] }, isFetching: false };
  },
}));

import { DatasetDetail } from './dataset-detail';

function changeInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  conversationQueries.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DatasetDetail conversation search', () => {
  it('keeps typing immediate and commits only the settled search with page zero', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(DatasetDetail, { slug: 'trace' })));
    act(() => vi.advanceTimersByTime(250));

    const next = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Next →',
    );
    expect(next).toBeDefined();
    act(() => next?.click());
    expect(conversationQueries.at(-1)).toMatchObject({ search: '', offset: 50 });

    conversationQueries.length = 0;
    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    act(() => changeInput(input!, 'a'));
    act(() => changeInput(input!, 'ab'));
    act(() => changeInput(input!, 'abc'));

    expect(input?.value).toBe('abc');
    expect(conversationQueries.every((query) => query.search === '')).toBe(true);
    expect(conversationQueries.every((query) => query.offset === 50)).toBe(true);
    expect(next?.disabled).toBe(true);

    act(() => vi.advanceTimersByTime(249));
    expect(conversationQueries.at(-1)).toMatchObject({ search: '', offset: 50 });

    act(() => vi.advanceTimersByTime(1));
    expect(conversationQueries.at(-1)).toMatchObject({ search: 'abc', offset: 0 });
    expect(next?.disabled).toBe(false);
    expect(new Set(conversationQueries.map((query) => query.search))).toEqual(new Set(['', 'abc']));

    act(() => root.unmount());
  });
});
