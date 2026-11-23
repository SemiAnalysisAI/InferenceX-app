// @test-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, mock, vi } from 'bun:test';

const track = vi.fn();
mock.module('@/lib/analytics/analytics', () => ({ track }));
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

import { render, settle } from '@/test/dom';
import { SiteSearchButton } from './site-search-button';

afterEach(() => track.mockClear());

describe('SiteSearchButton shortcut', () => {
  it('ignores keydown events without a key, which autofill dispatches', () => {
    render(createElement(SiteSearchButton));
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener('error', onError);
    document.dispatchEvent(new Event('keydown'));
    window.removeEventListener('error', onError);

    expect(errors).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });

  it('still opens on Ctrl+K', async () => {
    render(createElement(SiteSearchButton));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true }));
    });
    await settle(50);

    expect(track).toHaveBeenCalledWith('header_search_opened', { method: 'shortcut' });
  });
});
