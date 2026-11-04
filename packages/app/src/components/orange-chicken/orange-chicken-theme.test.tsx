// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/inference' }));
vi.mock('./orange-chicken-theme.css', () => ({}));

import OrangeChickenTheme from './orange-chicken-theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

afterEach(() => {
  document.documentElement.classList.remove('orange-chicken');
  document.body.replaceChildren();
});

describe('orange chicken markers', () => {
  it('stack a marker under the halo of a point whose label is not built', () => {
    document.documentElement.classList.add('orange-chicken');
    const chart = document.createElement('div');
    chart.dataset.orangeChickenEligible = 'true';
    const svg = document.createElementNS(SVG_NS, 'svg');
    const point = document.createElementNS(SVG_NS, 'g');
    point.setAttribute('class', 'dot-group');
    for (const className of ['', 'visible-shape', 'offload-halo']) {
      const child = document.createElementNS(SVG_NS, 'circle');
      if (className) child.setAttribute('class', className);
      point.append(child);
    }
    svg.append(point);
    chart.append(svg);
    document.body.append(chart);

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(createElement(OrangeChickenTheme)));

    expect([...point.children].map((child) => child.getAttribute('class'))).toEqual([
      null,
      'visible-shape',
      'orange-chicken-marker',
      'offload-halo',
    ]);
    act(() => root.unmount());
  });
});
