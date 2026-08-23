// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { testState } = vi.hoisted(() => ({
  testState: {
    locale: 'en' as 'en' | 'zh',
    conversation: {
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: PropsWithChildren<{ href: string }>) =>
    createElement('a', { href }, children),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: PropsWithChildren) => createElement('div', null, children),
}));
vi.mock('@/components/datasets/trace-flamegraph', () => ({ TraceFlamegraph: () => null }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/hooks/api/use-datasets', () => ({
  useDatasetConversation: () => testState.conversation,
}));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => testState.locale }));

import { ConversationView } from './conversation-view';
import { track } from '@/lib/analytics';

afterEach(() => {
  testState.locale = 'en';
  testState.conversation = {
    data: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
});

describe('ConversationView request states', () => {
  it('shows a localized request error with retry and back actions', () => {
    testState.locale = 'zh';
    testState.conversation.isError = true;
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() =>
      root.render(createElement(ConversationView, { slug: 'trace', convId: 'conversation-1' })),
    );

    expect(
      container.querySelector<HTMLElement>('[data-testid="conversation-view-error"]')?.dataset
        .locale,
    ).toBe('zh');
    expect(container.querySelector('[data-testid="conversation-view-not-found"]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/zh/agentx/trace');
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '重试',
    );
    expect(retry).toBeDefined();
    act(() => retry?.click());
    expect(track).toHaveBeenCalledWith('datasets_conversation_retry_clicked', { slug: 'trace' });
    expect(testState.conversation.refetch).toHaveBeenCalledOnce();
    expect(vi.mocked(track).mock.invocationCallOrder[0]).toBeLessThan(
      testState.conversation.refetch.mock.invocationCallOrder[0]!,
    );

    act(() => root.unmount());
  });

  it('uses the not-found state only for a successful null response', () => {
    testState.locale = 'zh';
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(ConversationView, { slug: 'trace', convId: 'missing' })));

    expect(
      container.querySelector<HTMLElement>('[data-testid="conversation-view-not-found"]')?.dataset
        .locale,
    ).toBe('zh');
    expect(container.querySelector('[data-testid="conversation-view-error"]')).toBeNull();
    expect([...container.querySelectorAll('button')]).toHaveLength(0);

    act(() => root.unmount());
  });
});
