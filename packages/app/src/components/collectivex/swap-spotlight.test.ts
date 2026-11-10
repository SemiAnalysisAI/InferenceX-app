// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';
import { spotlightSwap } from './CollectiveXSwapSection';

function chart() {
  const root = document.createElement('div');
  root.innerHTML = `<svg>
    <path class="line-path" data-line-key="1__gb200"></path>
    <path class="line-path" data-line-key="1__b200"></path>
    <path class="line-path" data-line-key="NVLink-C2C-225"></path>
    <path class="swap-range-band"></path><path class="swap-range-band"></path>
    <circle class="point"></circle><circle class="point"></circle>
  </svg>`;
  d3.select(root)
    .selectAll('path.swap-range-band')
    .data([{ id: '1__gb200' }, { id: '1__b200' }]);
  d3.select(root)
    .selectAll('.point')
    .data([{ legendId: '1__gb200' }, { legendId: '1__b200' }]);
  return root;
}
const opacities = (root: Element, selector: string) =>
  [...root.querySelectorAll<SVGElement>(selector)].map((el) => el.style.opacity);

describe('spotlightSwap', () => {
  it('fades every other line, point and band but keeps rooflines, then restores them', () => {
    const root = chart();
    const roofs = new Set(['NVLink-C2C-225']);
    spotlightSwap(root, '1__gb200', roofs);
    expect(opacities(root, '.line-path')).toEqual(['', '0.15', '']);
    expect(opacities(root, '.point')).toEqual(['', '0.15']);
    expect(opacities(root, 'path.swap-range-band')).toEqual(['', '0.15']);
    expect(
      [...root.querySelectorAll('path.swap-range-band')].map((el) =>
        el.getAttribute('fill-opacity'),
      ),
    ).toEqual(['0.3', '0.03']);
    spotlightSwap(root, null, roofs);
    expect(opacities(root, '.line-path')).toEqual(['', '', '']);
    expect(opacities(root, '.point')).toEqual(['', '']);
    expect(
      [...root.querySelectorAll('path.swap-range-band')].map((el) =>
        el.getAttribute('fill-opacity'),
      ),
    ).toEqual(['0.18', '0.18']);
  });
});
