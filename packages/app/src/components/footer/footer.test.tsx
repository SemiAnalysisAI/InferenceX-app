// @test-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'bun:test';

import { registerAnalyticsClient } from '@/lib/analytics/analytics';
import { stubGlobal } from '@/test/helpers';
import { click, get, render } from '@/test/dom';

import { Footer } from './footer';

describe('Footer', () => {
  it('marks star and share clicks as coming from the footer', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Footer />
      </QueryClientProvider>,
    );
    const capture = vi.fn();
    registerAnalyticsClient({ capture });
    stubGlobal('open', vi.fn());
    click(get('[data-testid="footer-star-cta"]'));
    expect(capture).toHaveBeenCalledWith('footer_star_starred', { placement: 'footer' });
    click(get('[data-testid="footer"] [data-testid="share-linkedin"]'));
    expect(capture).toHaveBeenCalledWith(
      'social_share_linkedin',
      expect.objectContaining({ placement: 'footer', route_template: expect.any(String) }),
    );
  });
});
