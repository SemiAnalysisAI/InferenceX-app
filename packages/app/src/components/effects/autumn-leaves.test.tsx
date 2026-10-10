// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AutumnLeaves } from './autumn-leaves';

describe('AutumnLeaves', () => {
  const html = renderToStaticMarkup(<AutumnLeaves />);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const strip = doc.querySelector('[data-testid="autumn-leaves"]')!;
  const leaves = [...doc.querySelectorAll<HTMLElement>('[data-testid="autumn-leaf"]')];

  it('is hidden from assistive tech', () => {
    expect(strip.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps phones to a few leaves and starts every leaf mid-fall', () => {
    expect(leaves.length).toBeGreaterThan(4);
    expect(leaves.filter((leaf) => !leaf.classList.contains('hidden')).length).toBe(4);
    for (const leaf of leaves) {
      expect(leaf.style.getPropertyValue('--leaf-delay')).toMatch(/^-\d+s$/);
      expect(leaf.style.getPropertyValue('--leaf-rest')).toMatch(/^\d+%$/);
    }
  });
});
