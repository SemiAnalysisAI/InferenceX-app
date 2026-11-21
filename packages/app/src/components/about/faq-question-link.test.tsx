// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { describe, expect, it, vi } from 'bun:test';

import { click, eventually, get, isVisible, render } from '@/test/dom';

import { FaqQuestionLink } from './faq-question-link';

const ID = 'faq-normalized-interactivity';
const QUESTION = 'What is the difference between normalized interactivity and interactivity?';

describe('FaqQuestionLink', () => {
  it('shows an icon-only control and copies the direct URL', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <PathnameContext.Provider value="/about">
        <div className="w-[760px] p-4 font-medium">
          <FaqQuestionLink id={ID} question={QUESTION} />
        </div>
      </PathnameContext.Provider>,
    );

    expect(get(`a[href="#${ID}"]`).textContent).toBe(QUESTION);
    const copy = get(`[data-testid="faq-copy-link-${ID}"]`);
    expect(isVisible(copy)).toBe(true);
    expect(copy.textContent).toBe('');
    expect(copy.getAttribute('title')).toBe('Copy link');
    expect(copy.getAttribute('aria-label')).toBe(`Copy link: ${QUESTION}`);
    click(copy);
    await eventually(() => {
      const copied = get(`[data-testid="faq-copy-link-${ID}"]`);
      expect(copied.getAttribute('title')).toBe('Copied');
      expect(copied.getAttribute('aria-label')).toBe(`Copied: ${QUESTION}`);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(new RegExp(`#${ID}$`, 'u'));
  });
});
