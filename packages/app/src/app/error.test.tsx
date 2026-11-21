// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { describe, expect, it, vi } from 'bun:test';

import { registerAnalyticsClient } from '@/lib/analytics/analytics';
import { click, contains, get, render } from '@/test/dom';

import AppError from './error';

describe('App error boundary localization', () => {
  it('preserves the accessible English recovery UI and tracks its lifecycle', () => {
    const capture = vi.fn();
    const reset = vi.fn();
    registerAnalyticsClient({ capture });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PathnameContext.Provider value="/infx/inference">
        <AppError
          error={Object.assign(new Error('fixture failure'), { digest: 'en-1' })}
          reset={reset}
        />
      </PathnameContext.Provider>,
    );

    expect(get('[role="alert"]').getAttribute('lang')).toBe('en');
    expect(capture).toHaveBeenCalledWith('error_page_shown', {
      message: 'fixture failure',
      digest: 'en-1',
      locale: 'en',
    });
    click(contains('button', 'Try again'));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('error_page_retry', { locale: 'en' });
  });
});
