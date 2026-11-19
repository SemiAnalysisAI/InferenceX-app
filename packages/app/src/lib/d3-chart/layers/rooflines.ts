import * as d3 from 'd3';

import { setAttrIfChanged, setStyleIfChanged, writeAttrs } from '../chart-update';
import type { ContinuousScale } from '../types';

import { projectedLinePath } from './line-path-cache';

export interface RooflineConfig {
  getColor: (key: string) => string;
  getOpacity?: (key: string) => number;
  isVisible?: (key: string) => boolean;
  strokeWidth?: number;
  strokeDasharray?: string;
  getDasharray?: (key: string) => string | null;
  curve?: d3.CurveFactory;
}

function dasharrayFor(config: RooflineConfig, key: string): string | null {
  return config.getDasharray ? config.getDasharray(key) : (config.strokeDasharray ?? null);
}

interface RooflineEntry<T> {
  key: string;
  points: T[];
}

export function renderRooflines<T extends { x: number; y: number }>(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  rooflines: Record<string, T[]>,
  xScale: ContinuousScale,
  yScale: ContinuousScale,
  config: RooflineConfig,
): void {
  const {
    getColor,
    getOpacity,
    isVisible,
    strokeWidth = 2,
    strokeDasharray,
    getDasharray,
  } = config;
  const curve = config.curve ?? d3.curveMonotoneX;

  const entries: RooflineEntry<T>[] = Object.entries(rooflines)
    .filter(([key, points]) => points.length >= 2 && (!isVisible || isVisible(key)))
    .map(([key, points]) => ({ key, points }));

  const selection = zoomGroup
    .selectAll<SVGPathElement, RooflineEntry<T>>('.roofline-path')
    .data(entries, (d) => d.key);

  const entered = selection
    .enter()
    .append('path')
    .attr('class', (d) => `roofline-path roofline-${d.key}`)
    .attr('fill', 'none');

  selection.exit().remove();

  const merged = entered.merge(selection);
  writeAttrs(merged, {
    class: (d) => `roofline-path roofline-${d.key}`,
    stroke: (d) => getColor(d.key),
    'stroke-width': strokeWidth,
  }).each(function (d) {
    setAttrIfChanged(this, 'd', projectedLinePath(this, d.points, xScale, yScale, curve) ?? '');
  });

  if (getDasharray) {
    writeAttrs(merged, { 'stroke-dasharray': (d) => getDasharray(d.key) });
  } else if (strokeDasharray) {
    writeAttrs(merged, { 'stroke-dasharray': strokeDasharray });
  }

  merged.each(function (d) {
    const opacity = getOpacity?.(d.key);
    if (opacity !== undefined) setStyleIfChanged(this, 'opacity', String(opacity));
  });
}

export function updateRooflinesForDisplay(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  config: RooflineConfig,
): void {
  const { getColor, getOpacity, strokeWidth = 2 } = config;
  writeAttrs(
    zoomGroup.selectAll<SVGPathElement, RooflineEntry<{ x: number; y: number }>>('.roofline-path'),
    {
      stroke: (d) => getColor(d.key),
      'stroke-width': strokeWidth,
      'stroke-dasharray': (d) => dasharrayFor(config, d.key),
    },
  ).each(function (d) {
    const opacity = getOpacity?.(d.key);
    if (opacity !== undefined) setStyleIfChanged(this, 'opacity', String(opacity));
  });
}

export function updateRooflinesOnZoom<T extends { x: number; y: number }>(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  rooflines: Record<string, T[]>,
  newXScale: ContinuousScale,
  newYScale: ContinuousScale,
  curve: d3.CurveFactory = d3.curveMonotoneX,
): void {
  Object.entries(rooflines).forEach(([key, points]) => {
    if (points.length < 2) return;
    const path = zoomGroup.select<SVGPathElement>(`.${cssEscapeToken(`roofline-${key}`)}`).node();
    if (!path) return;
    const d = projectedLinePath(path, points, newXScale, newYScale, curve);
    if (d === null) path.removeAttribute('d');
    else setAttrIfChanged(path, 'd', d);
  });
}

function cssEscapeToken(token: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(token);
  return token.replaceAll(/[^a-zA-Z0-9_-]/gu, (c) => `\\${c}`);
}
