// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, it, expect } from 'vitest';

import { createLogoWatermark, createUnofficialWatermark } from './watermark';

function makeSvg() {
  const svg = d3.create('svg:svg') as unknown as d3.Selection<
    SVGSVGElement,
    unknown,
    null,
    undefined
  >;
  const defs = svg.append('defs') as unknown as d3.Selection<
    SVGDefsElement,
    unknown,
    null,
    undefined
  >;
  return { svg, defs };
}

describe('createLogoWatermark', () => {
  const containerWidth = 800;
  const containerHeight = 600;
  const margin = { top: 20, right: 30, bottom: 40, left: 50 };
  const innerWidth = containerWidth - margin.left - margin.right;
  const innerHeight = containerHeight - margin.top - margin.bottom;

  it('creates a pattern element with id "logo-pattern"', () => {
    const { svg, defs } = makeSvg();
    createLogoWatermark(
      svg,
      defs,
      containerWidth,
      containerHeight,
      innerWidth,
      innerHeight,
      margin,
      'test',
    );

    const pattern = defs.select('#logo-pattern-test');
    expect(pattern.empty()).toBe(false);
    expect(pattern.attr('patternUnits')).toBe('userSpaceOnUse');
    expect(pattern.attr('width')).toBe(String(containerWidth));
    expect(pattern.attr('height')).toBe(String(containerHeight));
  });

  it('creates an image inside the pattern with correct sizing', () => {
    const { svg, defs } = makeSvg();
    createLogoWatermark(
      svg,
      defs,
      containerWidth,
      containerHeight,
      innerWidth,
      innerHeight,
      margin,
      'test',
    );

    const image = defs.select('#logo-pattern-test image');
    expect(image.empty()).toBe(false);
    expect(image.attr('href')).toBe('/brand/logo-color.webp');
    expect(image.attr('opacity')).toBe('0.1');

    const logoSize = Math.min(innerWidth, innerHeight) * 0.6;
    expect(Number(image.attr('width'))).toBe(logoSize);
    expect(Number(image.attr('height'))).toBe(logoSize);
  });

  it('centers the logo image within the chart area', () => {
    const { svg, defs } = makeSvg();
    createLogoWatermark(
      svg,
      defs,
      containerWidth,
      containerHeight,
      innerWidth,
      innerHeight,
      margin,
      'test',
    );

    const image = defs.select('#logo-pattern-test image');
    const logoSize = Math.min(innerWidth, innerHeight) * 0.6;
    const expectedX = margin.left + (innerWidth - logoSize) / 2;
    const expectedY = margin.top + (innerHeight - logoSize) / 2;

    expect(Number(image.attr('x'))).toBe(expectedX);
    expect(Number(image.attr('y'))).toBe(expectedY);
  });

  it('inserts a watermark rect masked to the inner chart area', () => {
    const { svg, defs } = makeSvg();
    createLogoWatermark(
      svg,
      defs,
      containerWidth,
      containerHeight,
      innerWidth,
      innerHeight,
      margin,
      'test',
    );

    const rect = svg.select('.watermark-rect');
    expect(rect.empty()).toBe(false);
    expect(rect.attr('fill')).toBe('url(#logo-pattern-test)');
    expect(Number(rect.attr('x'))).toBe(margin.left);
    expect(Number(rect.attr('y'))).toBe(margin.top);
    expect(Number(rect.attr('width'))).toBe(innerWidth);
    expect(Number(rect.attr('height'))).toBe(innerHeight);
  });

  it('uses smaller dimension to compute logo size for tall charts', () => {
    const { svg, defs } = makeSvg();
    const tallInnerWidth = 200;
    const tallInnerHeight = 800;
    createLogoWatermark(svg, defs, 300, 900, tallInnerWidth, tallInnerHeight, margin, 'test');

    const image = defs.select('#logo-pattern-test image');
    const logoSize = Math.min(tallInnerWidth, tallInnerHeight) * 0.6;
    expect(Number(image.attr('width'))).toBe(logoSize);
    expect(logoSize).toBe(200 * 0.6);
  });

  it('uses smaller dimension to compute logo size for wide charts', () => {
    const { svg, defs } = makeSvg();
    const wideInnerWidth = 800;
    const wideInnerHeight = 200;
    createLogoWatermark(svg, defs, 900, 300, wideInnerWidth, wideInnerHeight, margin, 'test');

    const image = defs.select('#logo-pattern-test image');
    const logoSize = Math.min(wideInnerWidth, wideInnerHeight) * 0.6;
    expect(Number(image.attr('width'))).toBe(logoSize);
    expect(logoSize).toBe(200 * 0.6);
  });
});

describe('createUnofficialWatermark', () => {
  const margin = { top: 20, right: 30, bottom: 40, left: 50 };
  const innerWidth = 720;
  const innerHeight = 540;

  it('creates a pattern element with id "unofficial-pattern"', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, innerWidth, innerHeight, margin, 'test');

    const pattern = defs.select('#unofficial-pattern-test');
    expect(pattern.empty()).toBe(false);
    expect(pattern.attr('patternUnits')).toBe('userSpaceOnUse');
    expect(pattern.attr('width')).toBe('200');
    expect(pattern.attr('height')).toBe('200');
    expect(pattern.attr('patternTransform')).toBe('rotate(-45)');
  });

  it('creates "UNOFFICIAL" labels with the expected styling', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, innerWidth, innerHeight, margin, 'test');

    const texts = defs.selectAll('#unofficial-pattern-test text');
    expect(texts.size()).toBe(3);
    texts.each(function () {
      const t = d3.select(this);
      expect(t.text()).toBe('UNOFFICIAL');
      expect(t.attr('fill')).toBe('#dc2626');
      expect(t.attr('font-size')).toBe('24px');
      expect(t.attr('font-weight')).toBe('bold');
      expect(t.attr('opacity')).toBe('0.15');
    });
  });

  it('lays out a brick pattern with the second row staggered to the seams', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, innerWidth, innerHeight, margin, 'test');

    const positions = defs
      .selectAll<SVGTextElement, unknown>('#unofficial-pattern-test text')
      .nodes()
      .map((n) => ({ x: n.getAttribute('x'), y: n.getAttribute('y') }));
    expect(positions).toEqual([
      { x: '100', y: '50' }, // row 1 centered
      { x: '0', y: '150' }, // row 2 left seam
      { x: '200', y: '150' }, // row 2 right seam
    ]);
  });

  it('inserts a watermark rect masked to the inner chart area', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, innerWidth, innerHeight, margin, 'test');

    const rect = svg.select('.watermark-rect');
    expect(rect.empty()).toBe(false);
    expect(rect.attr('fill')).toBe('url(#unofficial-pattern-test)');
    expect(Number(rect.attr('x'))).toBe(margin.left);
    expect(Number(rect.attr('y'))).toBe(margin.top);
    expect(Number(rect.attr('width'))).toBe(innerWidth);
    expect(Number(rect.attr('height'))).toBe(innerHeight);
  });

  it('inserts the rect before other children (first-child)', () => {
    const { svg, defs } = makeSvg();
    // Add a dummy child before calling watermark
    svg.append('g').attr('class', 'pre-existing');
    createUnofficialWatermark(svg, defs, innerWidth, innerHeight, margin, 'test');

    // The watermark rect should be inserted before defs (first child)
    const firstChild = svg.select(':first-child');
    expect(firstChild.attr('class')).toBe('watermark-rect');
  });
});
