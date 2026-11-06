// @vitest-environment jsdom
import * as d3 from 'd3';
import { expect, it } from 'vitest';

import { SHAPE_ORDER, type ShapeKey } from '@/lib/charts/chart-rendering';

import { ensureCanvasPointLayer } from './canvas-points';
import {
  renderScatterPoints,
  syncPointLabel,
  updateScatterPointsForDisplay,
  type ScatterPointConfig,
} from './scatter-points';

interface Datum {
  id: string;
  precision: string;
  x: number;
  y: number;
}

interface State {
  shapes: Record<string, ShapeKey>;
  labels: boolean;
  faded: Set<string>;
  halos: Set<string>;
}

const key = (datum: Datum) => datum.id;
const identity = d3.scaleLinear().domain([0, 100]).range([0, 100]);
type Group = d3.Selection<SVGGElement, unknown, null, undefined>;

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function configFor(state: State): ScatterPointConfig<Datum> {
  return {
    getColor: () => 'red',
    getShapeKey: (d) => state.shapes[d.precision],
    getLabelText: (d) => d.id,
    foreground: 'black',
    hideLabels: !state.labels,
  };
}

function applyFade(group: Group, state: State): void {
  group
    .selectAll<SVGGElement, Datum>('.dot-group')
    .style('filter', (d) => (state.faded.has(d.id) ? 'opacity(0.2)' : null));
}

function applyTransitions(group: Group): void {
  group.selectAll<SVGGElement, unknown>('.dot-group').each(function () {
    if (this.style.getPropertyValue('transition') === '') {
      this.style.setProperty('transition', 'opacity 150ms ease');
    }
  });
}

function applyHalos(group: Group, state: State): void {
  group.selectAll<SVGGElement, Datum>('.dot-group').each(function (d) {
    const halo = this.querySelector(':scope > .offload-halo');
    if (!state.halos.has(d.id)) halo?.remove();
    else if (!halo) d3.select(this).append('circle').attr('class', 'offload-halo');
  });
}

function display(group: Group, state: State): void {
  updateScatterPointsForDisplay(group, configFor(state));
  group.selectAll<SVGGElement, Datum>('.dot-group').each(function () {
    const halo = this.querySelector(':scope > .offload-halo');
    if (halo?.nextSibling) this.append(halo);
  });
}

function dotMarkup(group: Group): string[] {
  return group
    .selectAll<SVGGElement, unknown>('.dot-group')
    .nodes()
    .map(
      (node) =>
        `${node.getAttribute('style')}|${[...node.children].map((child) => child.getAttribute('class')).join(',')}`,
    );
}

it('restores the stacking and style order the SVG points would have reached', () => {
  const random = seeded(5);
  const pick = <V>(values: readonly V[]): V => values[Math.floor(random() * values.length)];
  const precisions = ['fp4', 'fp8', 'bf16'];
  const pool = [...'abcdefghij'];
  let replacedAndLabelled = 0;
  let transitionBeforeFilter = 0;
  let filterBeforeTransition = 0;
  for (let round = 0; round < 60; round++) {
    const svg = d3.create('svg:svg');
    document.body.append(svg.node()!);
    const live = svg.append('g') as Group;
    const canvasGroup = svg.append('g').node()!;
    const layer = ensureCanvasPointLayer<Datum>(canvasGroup);
    const state: State = {
      shapes: Object.fromEntries(precisions.map((p) => [p, pick(SHAPE_ORDER)])),
      labels: false,
      faded: new Set(),
      halos: new Set(),
    };
    let data: Datum[] = [];
    const syncCanvas = () => {
      layer.setHalo((d) => (state.halos.has(d.id) ? 'black' : null), {
        radius: 1,
        strokeWidth: 1,
        dash: [],
        opacity: 1,
      });
      layer.setFade((d) => state.faded.has(d.id));
    };
    for (let step = 0; step < 14; step++) {
      const op = pick(['join', 'shape', 'labels', 'fade', 'halo'] as const);
      if (op === 'join' || data.length === 0) {
        data = pool
          .filter(() => random() < 0.6)
          .map((id) => ({ id, precision: pick(precisions), x: random() * 100, y: 50 }));
        renderScatterPoints(live, data, identity, identity, configFor(state), key);
        applyFade(live, state);
        applyTransitions(live);
        applyHalos(live, state);
        display(live, state);
        layer.join(data, key, 100, 100);
        layer.restyle(configFor(state));
        syncCanvas();
        layer.setOpacityTransition(150);
        continue;
      }
      if (op === 'shape') state.shapes[pick(precisions)] = pick(SHAPE_ORDER);
      if (op === 'labels') state.labels = !state.labels;
      if (op === 'fade') state.faded = new Set(pool.filter(() => random() < 0.5));
      if (op === 'halo') state.halos = new Set(pool.filter(() => random() < 0.5));
      display(live, state);
      live.selectAll<SVGGElement, Datum>('.dot-group').each(function (d) {
        syncPointLabel(this, d.id, 'black', !state.labels);
      });
      applyFade(live, state);
      applyHalos(live, state);
      layer.restyle(configFor(state));
      syncCanvas();
    }
    const exported = svg.append('g') as Group;
    renderScatterPoints(
      exported,
      layer.orderedLike(data, key),
      identity,
      identity,
      configFor(state),
      key,
    );
    applyFade(exported, state);
    applyTransitions(exported);
    applyHalos(exported, state);
    layer.restoreExportOrder(exported.node()!, key);
    const expected = dotMarkup(live);
    expect(dotMarkup(exported)).toEqual(expected);
    for (const markup of expected) {
      if (/point-label.*visible-shape/.test(markup)) replacedAndLabelled++;
      if (/transition.*filter/.test(markup)) transitionBeforeFilter++;
      if (/filter.*transition/.test(markup)) filterBeforeTransition++;
    }
    svg.remove();
  }
  expect(replacedAndLabelled).toBeGreaterThan(0);
  expect(transitionBeforeFilter).toBeGreaterThan(0);
  expect(filterBeforeTransition).toBeGreaterThan(0);
});

it('leaves a repeated key as the fresh export point the SVG join re-created', () => {
  const svg = d3.create('svg:svg');
  document.body.append(svg.node()!);
  const layer = ensureCanvasPointLayer<Datum>(svg.append('g').node()!);
  const data = [
    { id: 'a', precision: 'fp4', x: 1, y: 1 },
    { id: 'a', precision: 'fp4', x: 2, y: 2 },
  ];
  const state: State = {
    shapes: { fp4: 'circle' },
    labels: true,
    faded: new Set(),
    halos: new Set(),
  };
  layer.join(data, key, 100, 100);
  layer.restyle(configFor(state));
  layer.setOpacityTransition(150);
  state.shapes.fp4 = 'square';
  layer.restyle(configFor(state));
  state.faded = new Set(['a']);
  layer.setFade((d) => state.faded.has(d.id));
  const exported = svg.append('g') as Group;
  renderScatterPoints(exported, data, identity, identity, configFor(state), key);
  applyFade(exported, state);
  applyTransitions(exported);
  layer.restoreExportOrder(exported.node()!, key);
  expect(dotMarkup(exported)).toEqual([
    'transition: opacity 150ms ease; filter: opacity(0.2);|,point-label,visible-shape',
    'filter: opacity(0.2); transition: opacity 150ms ease;|,visible-shape,point-label',
  ]);
  svg.remove();
});
