// @test-environment jsdom
import { describe, expect, it, vi } from 'bun:test';

import { registerAnalyticsClient } from '@/lib/analytics/analytics';
import { click, contains, eventually, get, isVisible, render } from '@/test/dom';

import { HeadingLink } from './heading-link';

describe('Blog shared chrome', () => {
  it('localizes heading-link feedback and tracks a Chinese copy interaction', async () => {
    const capture = vi.fn();
    const writeText = vi.fn(() => Promise.resolve());
    registerAnalyticsClient({ capture });
    window.history.replaceState(null, '', '/zh/blog/example');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<HeadingLink id="test-section" locale="zh" />);
    click(get('a[aria-label="复制本节链接"]'));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/zh/blog/example#test-section`,
    );
    await eventually(() => expect(isVisible(contains('链接已复制'))).toBe(true));
    expect(capture).toHaveBeenCalledWith('blog_heading_link_copied', { id: 'test-section' });
  });
});
