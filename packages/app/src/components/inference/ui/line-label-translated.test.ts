// @test-environment jsdom
import * as d3 from 'd3';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { keepPointLabelsInPlot, renderLineLabels } from './line-label-layer';

const SVG_NS = 'http://www.w3.org/2000/svg';
const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');

// Bilingual translation extensions put an HTML copy of chart text, with its class, next to it.
function addTranslationClone(parent: Element, className: string) {
  const clone = document.createElement('font');
  clone.setAttribute('class', className);
  clone.textContent = '译文';
  parent.prepend(clone);
}

function chartGroup() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.append(svg);
  return d3.select(svg).append('g');
}

beforeEach(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value(this: SVGElement) {
      return DOMRect.fromRect({ width: (this.textContent?.length ?? 0) * 7, height: 14 });
    },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  if (originalGetBBox) Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
  else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
});

describe('chart labels beside translator clones', () => {
  it('sizes line-label pills from the SVG text, not the HTML clone', () => {
    const group = chartGroup();
    const label = { key: 'h100', seriesId: 'h100', label: 'H100', color: '#123456', x: 10, y: 10 };
    const render = () =>
      renderLineLabels(group, [{ ...label, visible: true }], {
        seriesAttribute: 'data-series',
        bounds: null,
      });
    render();
    addTranslationClone(group.select<SVGGElement>('.line-label').node()!, 'll-text');

    expect(render).not.toThrow();
    expect(group.select('.ll-bg').attr('width')).toBe(String(4 * 7 + 10));
  });

  it('places point labels that have a translator clone beside them', () => {
    const group = chartGroup();
    const dot = group.append('g').attr('class', 'dot-group').attr('transform', 'translate(50,50)');
    dot.append('text').attr('class', 'point-label').append('tspan').text('TP8');
    addTranslationClone(dot.node()!, 'point-label');

    expect(() => keepPointLabelsInPlot(group, null)).not.toThrow();
    expect(dot.select('text.point-label tspan').attr('dy')).not.toBeNull();
  });
});
