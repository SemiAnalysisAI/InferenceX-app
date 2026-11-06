import * as d3 from 'd3';

import { setStyleIfChanged, writeAttrs, writeText } from '../chart-update';
import { CHART_TYPE, px } from '../typography';

export interface RadarConfig<T = any> {
  axes: { label: string; unit?: string }[];
  getValue: (d: T, axisIndex: number) => number | null;
  getRawValue?: (d: T, axisIndex: number) => number | null;
  getColor: (d: T) => string;
  getLabel?: (d: T) => string;
  levels?: number;
  labelMargin?: number;
  keyFn?: (d: T) => string;
}

export interface RadarDot<T> {
  item: T;
  axisIndex: number;
  cx: number;
  cy: number;
  color: string;
  key: string;
}

export function renderRadar<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  width: number,
  height: number,
  config: RadarConfig<T>,
): d3.Selection<SVGCircleElement, RadarDot<T>, SVGGElement, unknown> {
  const { axes, getValue, getColor, levels = 5, labelMargin = 30, keyFn } = config;
  const numAxes = axes.length;
  const angleSlice = (Math.PI * 2) / numAxes;

  const size = Math.min(width, height);
  const radius = (size - labelMargin * 2) / 2;
  const centerX = width / 2;
  const centerY = height / 2;

  let radarG = group.select<SVGGElement>('.radar-center');
  if (radarG.empty()) {
    radarG = group.append('g').attr('class', 'radar-center');
  }
  writeAttrs(radarG, { transform: `translate(${centerX},${centerY})` });

  if (radius <= 0) {
    return radarG.selectAll<SVGCircleElement, RadarDot<T>>('.radar-dot').data([] as RadarDot<T>[]);
  }

  const cosAngles = new Float64Array(numAxes);
  const sinAngles = new Float64Array(numAxes);
  for (let i = 0; i < numAxes; i++) {
    const angle = angleSlice * i - Math.PI / 2;
    cosAngles[i] = Math.cos(angle);
    sinAngles[i] = Math.sin(angle);
  }

  const rPerLevel = radius / levels;

  const gridData = d3.range(1, levels + 1);
  writeAttrs(
    radarG
      .selectAll<SVGCircleElement, number>('.radar-grid')
      .data(gridData, (d) => d)
      .join('circle'),
    {
      class: 'radar-grid',
      cx: 0,
      cy: 0,
      r: (d) => rPerLevel * d,
      fill: 'none',
      stroke: 'var(--border-alt)',
      'stroke-width': 0.5,
      'stroke-dasharray': (d) => (d < levels ? '2,3' : 'none'),
    },
  );

  const gridLabels = writeAttrs(
    radarG
      .selectAll<SVGTextElement, number>('.radar-grid-label')
      .data(gridData, (d) => d)
      .join('text'),
    {
      class: 'radar-grid-label',
      x: 4,
      y: (d) => -rPerLevel * d + 4,
      'font-size': px(CHART_TYPE.micro),
      fill: 'var(--border)',
      opacity: 0.6,
    },
  );
  writeText(gridLabels, (d) => `${Math.round((d / levels) * 100)}%`);

  writeAttrs(
    radarG
      .selectAll<SVGLineElement, number>('.radar-spoke')
      .data(d3.range(numAxes), (d) => d)
      .join('line'),
    {
      class: 'radar-spoke',
      x1: 0,
      y1: 0,
      x2: (_, i) => cosAngles[i] * radius,
      y2: (_, i) => sinAngles[i] * radius,
      stroke: 'var(--border)',
      'stroke-width': 0.8,
      opacity: 0.4,
    },
  );

  const labelRadius = radius + 20;
  const axisData = axes.map((a, i) => ({ ...a, index: i }));
  const axisLabels = writeAttrs(
    radarG
      .selectAll<SVGTextElement, (typeof axisData)[0]>('.radar-axis-label')
      .data(axisData, (d) => d.label)
      .join('text'),
    {
      class: 'radar-axis-label',
      x: (d) => cosAngles[d.index] * labelRadius,
      y: (d) => sinAngles[d.index] * labelRadius,
      'text-anchor': (d) => {
        const cos = cosAngles[d.index];
        if (Math.abs(cos) < 0.1) return 'middle';
        return cos > 0 ? 'start' : 'end';
      },
      'dominant-baseline': 'central',
      'font-size': px(CHART_TYPE.dataLabel),
      'font-weight': '500',
      fill: 'var(--foreground)',
    },
  );
  writeText(axisLabels, (d) => d.label);

  const lineGen = d3
    .line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1]);

  writeAttrs(
    radarG
      .selectAll<SVGPathElement, T>('.radar-polygon')
      .data(data, keyFn ?? ((_, i) => i))
      .join('path'),
    {
      class: 'radar-polygon',
      d: (d) => {
        const points: [number, number][] = [];
        for (let i = 0; i < numAxes; i++) {
          const val = getValue(d, i);
          const r = val === null ? 0 : val * radius;
          points.push([cosAngles[i] * r, sinAngles[i] * r]);
        }
        points.push(points[0]);
        return lineGen(points);
      },
      fill: (d) => getColor(d),
      'fill-opacity': 0.08,
      stroke: (d) => getColor(d),
      'stroke-width': 1.5,
      'stroke-opacity': 0.7,
    },
  );

  const dots: RadarDot<T>[] = [];
  for (let di = 0; di < data.length; di++) {
    const item = data[di];
    const color = getColor(item);
    const itemKey = keyFn ? keyFn(item) : String(di);
    for (let i = 0; i < numAxes; i++) {
      const val = getValue(item, i);
      if (val === null) continue;
      const r = val * radius;
      dots.push({
        item,
        axisIndex: i,
        cx: cosAngles[i] * r,
        cy: sinAngles[i] * r,
        color,
        key: `${itemKey}-${i}`,
      });
    }
  }

  const radarDots = radarG
    .selectAll<SVGCircleElement, RadarDot<T>>('.radar-dot')
    .data(dots, (d) => d.key)
    .join('circle');
  return writeAttrs(radarDots, {
    class: 'radar-dot',
    cx: (d) => d.cx,
    cy: (d) => d.cy,
    r: 3.5,
    fill: (d) => d.color,
    stroke: 'white',
    'stroke-width': 1,
  }).each(function () {
    setStyleIfChanged(this, 'cursor', 'pointer');
  });
}
