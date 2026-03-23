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
    );

    const pattern = defs.select('#logo-pattern');
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
    );

    const image = defs.select('#logo-pattern image');
    expect(image.empty()).toBe(false);
    expect(image.attr('href')).toBe('/brand/logo-color.png');
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
    );

    const image = defs.select('#logo-pattern image');
    const logoSize = Math.min(innerWidth, innerHeight) * 0.6;
    const expectedX = margin.left + (innerWidth - logoSize) / 2;
    const expectedY = margin.top + (innerHeight - logoSize) / 2;

    expect(Number(image.attr('x'))).toBe(expectedX);
    expect(Number(image.attr('y'))).toBe(expectedY);
  });

  it('creates a watermark rect as the first child of SVG', () => {
    const { svg, defs } = makeSvg();
    createLogoWatermark(
      svg,
      defs,
      containerWidth,
      containerHeight,
      innerWidth,
      innerHeight,
      margin,
    );

    const rect = svg.select('.watermark-rect');
    expect(rect.empty()).toBe(false);
    expect(rect.attr('fill')).toBe('url(#logo-pattern)');
    expect(Number(rect.attr('width'))).toBe(containerWidth);
    expect(Number(rect.attr('height'))).toBe(containerHeight);
  });

  it('uses smaller dimension to compute logo size for tall charts', () => {
    const { svg, defs } = makeSvg();
    const tallInnerWidth = 200;
    const tallInnerHeight = 800;
    createLogoWatermark(svg, defs, 300, 900, tallInnerWidth, tallInnerHeight, margin);

    const image = defs.select('#logo-pattern image');
    const logoSize = Math.min(tallInnerWidth, tallInnerHeight) * 0.6;
    expect(Number(image.attr('width'))).toBe(logoSize);
    expect(logoSize).toBe(200 * 0.6);
  });

  it('uses smaller dimension to compute logo size for wide charts', () => {
    const { svg, defs } = makeSvg();
    const wideInnerWidth = 800;
    const wideInnerHeight = 200;
    createLogoWatermark(svg, defs, 900, 300, wideInnerWidth, wideInnerHeight, margin);

    const image = defs.select('#logo-pattern image');
    const logoSize = Math.min(wideInnerWidth, wideInnerHeight) * 0.6;
    expect(Number(image.attr('width'))).toBe(logoSize);
    expect(logoSize).toBe(200 * 0.6);
  });
});

describe('createUnofficialWatermark', () => {
  const containerWidth = 800;
  const containerHeight = 600;

  it('creates a pattern element with id "unofficial-pattern"', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, containerWidth, containerHeight);

    const pattern = defs.select('#unofficial-pattern');
    expect(pattern.empty()).toBe(false);
    expect(pattern.attr('patternUnits')).toBe('userSpaceOnUse');
    expect(pattern.attr('width')).toBe('200');
    expect(pattern.attr('height')).toBe('200');
    expect(pattern.attr('patternTransform')).toBe('rotate(-45)');
  });

  it('creates a text element with "UNOFFICIAL" inside the pattern', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, containerWidth, containerHeight);

    const text = defs.select('#unofficial-pattern text');
    expect(text.empty()).toBe(false);
    expect(text.text()).toBe('UNOFFICIAL');
    expect(text.attr('fill')).toBe('#dc2626');
    expect(text.attr('font-size')).toBe('24px');
    expect(text.attr('font-weight')).toBe('bold');
    expect(text.attr('opacity')).toBe('0.15');
  });

  it('centers the text within the 200x200 pattern tile', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, containerWidth, containerHeight);

    const text = defs.select('#unofficial-pattern text');
    expect(text.attr('x')).toBe('100');
    expect(text.attr('y')).toBe('100');
    expect(text.attr('text-anchor')).toBe('middle');
    expect(text.attr('dominant-baseline')).toBe('middle');
  });

  it('creates a watermark rect as the first child of SVG', () => {
    const { svg, defs } = makeSvg();
    createUnofficialWatermark(svg, defs, containerWidth, containerHeight);

    const rect = svg.select('.watermark-rect');
    expect(rect.empty()).toBe(false);
    expect(rect.attr('fill')).toBe('url(#unofficial-pattern)');
    expect(Number(rect.attr('width'))).toBe(containerWidth);
    expect(Number(rect.attr('height'))).toBe(containerHeight);
  });

  it('inserts the rect before other children (first-child)', () => {
    const { svg, defs } = makeSvg();
    // Add a dummy child before calling watermark
    svg.append('g').attr('class', 'pre-existing');
    createUnofficialWatermark(svg, defs, containerWidth, containerHeight);

    // The watermark rect should be inserted before defs (first child)
    const firstChild = svg.select(':first-child');
    expect(firstChild.attr('class')).toBe('watermark-rect');
  });
});
