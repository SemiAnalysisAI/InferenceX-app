// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { conversationQueries, testState } = vi.hoisted(() => ({
  conversationQueries: [] as {
    slug: string | null;
    search?: string;
    limit?: number;
    offset?: number;
    sort?: string;
  }[],
  testState: {
    locale: 'en' as 'en' | 'zh',
    dataset: {
      data: {
        slug: 'trace',
        label: 'Trace dataset',
        variant: 'test',
        conversation_count: 100,
        summary: {},
        chart_data: {},
      } as {
        slug: string;
        label: string;
        variant: string;
        conversation_count: number;
        summary: Record<string, never>;
        chart_data: Record<string, never>;
      } | null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    conversations: {
      data: { total: 100, items: [] } as { total: number; items: never[] } | undefined,
      isFetching: false,
      isPlaceholderData: false,
      isError: false,
    },
  },
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
  SelectTrigger: ({
    children,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) =>
    createElement('button', props, children),
  SelectValue: () => null,
}));
vi.mock('@/components/datasets/distribution-card', () => ({ DistributionCard: () => null }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => testState.locale }));
vi.mock('@/hooks/api/use-datasets', () => ({
  useDataset: () => testState.dataset,
  useDatasetConversations: (args: (typeof conversationQueries)[number]) => {
    conversationQueries.push({ ...args });
    return testState.conversations;
  },
}));

import { DatasetDetail } from './dataset-detail';
import { track } from '@/lib/analytics';

function changeInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  conversationQueries.length = 0;
  testState.locale = 'en';
  testState.dataset = {
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
    refetch: vi.fn(),
  };
  testState.conversations = {
    data: { total: 100, items: [] },
    isFetching: false,
    isPlaceholderData: false,
    isError: false,
  };
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DatasetDetail conversation search', () => {
  it('distinguishes a localized request failure from a genuine not-found response', () => {
    testState.locale = 'zh';
    testState.dataset.isError = true;
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(DatasetDetail, { slug: 'trace' })));

    expect(
      container.querySelector<HTMLElement>('[data-testid="dataset-detail-error"]')?.dataset.locale,
    ).toBe('zh');
    expect(container.querySelector('[data-testid="dataset-detail-not-found"]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/zh/agentx');
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '重试',
    );
    expect(retry).toBeDefined();
    act(() => retry?.click());
    expect(track).toHaveBeenCalledWith('datasets_detail_retry_clicked', { slug: 'trace' });
    expect(testState.dataset.refetch).toHaveBeenCalledOnce();
    expect(vi.mocked(track).mock.invocationCallOrder[0]).toBeLessThan(
      testState.dataset.refetch.mock.invocationCallOrder[0]!,
    );

    act(() => root.unmount());
  });

  it('keeps a successful null dataset response as the localized not-found state', () => {
    testState.locale = 'zh';
    testState.dataset.data = null;
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(DatasetDetail, { slug: 'missing' })));

    expect(
      container.querySelector<HTMLElement>('[data-testid="dataset-detail-not-found"]')?.dataset
        .locale,
    ).toBe('zh');
    expect(container.querySelector('[data-testid="dataset-detail-error"]')).toBeNull();
    expect([...container.querySelectorAll('button')]).toHaveLength(0);

    act(() => root.unmount());
  });

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

  it('localizes the initial conversation loading state', () => {
    testState.locale = 'zh';
    testState.conversations = {
      data: undefined,
      isFetching: true,
      isPlaceholderData: false,
      isError: false,
    };
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(DatasetDetail, { slug: 'trace' })));

    expect(container.textContent).toContain('正在加载对话…');
    expect(container.textContent).not.toContain('没有匹配的对话。');

    act(() => root.unmount());
  });

  it('localizes the initial conversation error state without showing the empty state', () => {
    testState.locale = 'zh';
    testState.conversations = {
      data: undefined,
      isFetching: false,
      isPlaceholderData: false,
      isError: true,
    };
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(DatasetDetail, { slug: 'trace' })));

    expect(container.textContent).toContain('对话加载失败。');
    expect(container.textContent).not.toContain('没有匹配的对话。');

    act(() => root.unmount());
  });

  it('passes the active locale to application-owned number formatting', () => {
    testState.locale = 'zh';
    const localeCalls: (Intl.LocalesArgument | undefined)[] = [];
    vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(
      function (this: number, locales) {
        localeCalls.push(locales);
        return String(this.valueOf());
      },
    );
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(DatasetDetail, { slug: 'trace' })));

    expect(localeCalls).toContain('zh-CN');

    act(() => root.unmount());
  });
});
