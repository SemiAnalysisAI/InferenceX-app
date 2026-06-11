// @vitest-environment jsdom
import * as d3 from 'd3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KNOWN_CONFIG_ISSUES } from '@/lib/known-issues';

import {
  type AnnotationRenderOptions,
  type KnownIssueAnnotation,
  renderKnownIssueAnnotations,
} from './knownIssueAnnotations';

let g: d3.Selection<SVGGElement, unknown, null, undefined>;
let defs: d3.Selection<SVGDefsElement, unknown, null, undefined>;

const gb300Annotation: KnownIssueAnnotation = {
  issue: KNOWN_CONFIG_ISSUES[0],
  label: 'GB300 NVL72 (Dynamo TRT, MTP)',
  color: 'rgb(118, 185, 0)',
  points: [
    { x: 100, y: 300 },
    { x: 200, y: 200 },
  ],
};

const mi355xAnnotation: KnownIssueAnnotation = {
  issue: KNOWN_CONFIG_ISSUES[1],
  label: 'MI355X (MoRI SGLang, MTP)',
  color: 'rgb(237, 28, 36)',
  points: [{ x: 150, y: 250 }],
};

function baseOptions(overrides: Partial<AnnotationRenderOptions> = {}): AnnotationRenderOptions {
  return {
    chartId: 'chart-0',
    width: 800,
    height: 500,
    xScale: (v) => v,
    yScale: (v) => v,
    annotations: [gb300Annotation, mi355xAnnotation],
    background: '#fff',
    foreground: '#111',
    mutedForeground: '#666',
    ...overrides,
  };
}

beforeEach(() => {
  const svg = d3
    .select(document.body)
    .html('')
    .append('svg')
    .attr('width', 800)
    .attr('height', 500);
  defs = svg.append('defs');
  g = svg.append('g');
});

describe('renderKnownIssueAnnotations', () => {
  it('renders nothing when there are no annotations', () => {
    renderKnownIssueAnnotations(g, defs, baseOptions({ annotations: [] }));
    expect(g.select('.known-issue-annotations').empty()).toBe(true);
  });

  it('renders one linked warning box per annotation with label and issue ref', () => {
    renderKnownIssueAnnotations(g, defs, baseOptions());

    const boxes = g.selectAll('[data-testid="known-issue-annotation"]').nodes() as SVGAElement[];
    expect(boxes).toHaveLength(2);

    expect(boxes[0].getAttribute('href')).toBe('https://github.com/NVIDIA/srt-slurm/issues/51');
    expect(boxes[0].getAttribute('target')).toBe('_blank');
    expect(boxes[0].textContent).toContain('GB300 NVL72 (Dynamo TRT, MTP)');
    expect(boxes[0].textContent).toContain('Accuracy issues — filed since Apr 21, 2026');
    expect(boxes[0].textContent).toContain('NVIDIA/srt-slurm#51');

    expect(boxes[1].getAttribute('href')).toBe(
      'https://github.com/sgl-project/sglang/issues/27194',
    );
    expect(boxes[1].textContent).toContain('MI355X (MoRI SGLang, MTP)');
  });

  it('stacks boxes without overlap, right-aligned inside the plot', () => {
    renderKnownIssueAnnotations(g, defs, baseOptions());

    const rects = g.selectAll('.known-issue-annotation rect').nodes() as SVGRectElement[];
    expect(rects).toHaveLength(2);
    const top0 = Number(rects[0].getAttribute('y'));
    const bottom0 = top0 + Number(rects[0].getAttribute('height'));
    const top1 = Number(rects[1].getAttribute('y'));
    expect(top1).toBeGreaterThan(bottom0);
    for (const rect of rects) {
      expect(Number(rect.getAttribute('x'))).toBeGreaterThanOrEqual(0);
      // Right edges align at the plot's right edge minus the gap
      expect(Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))).toBe(800 - 10);
    }
  });

  it('shifts boxes left of a floating legend via rightInset', () => {
    renderKnownIssueAnnotations(g, defs, baseOptions({ rightInset: 120 }));

    const rects = g.selectAll('.known-issue-annotation rect').nodes() as SVGRectElement[];
    for (const rect of rects) {
      expect(Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))).toBe(
        800 - 10 - 120,
      );
    }
  });

  it('draws a series-colored arrow with an arrowhead marker per annotation', () => {
    renderKnownIssueAnnotations(g, defs, baseOptions());

    const arrows = g.selectAll('.known-issue-arrow').nodes() as SVGPathElement[];
    expect(arrows).toHaveLength(2);
    expect(arrows[0].getAttribute('stroke')).toBe('rgb(118, 185, 0)');
    expect(arrows[0].getAttribute('marker-end')).toBe('url(#known-issue-arrowhead-chart-0-0)');
    expect(defs.select('#known-issue-arrowhead-chart-0-1').empty()).toBe(false);
  });

  it('omits the arrow when the series is zoomed/panned out of view', () => {
    // Scales push every point far outside the 800x500 plot
    renderKnownIssueAnnotations(
      g,
      defs,
      baseOptions({ annotations: [gb300Annotation], xScale: (v) => v + 10_000 }),
    );

    expect(g.selectAll('[data-testid="known-issue-annotation"]').nodes()).toHaveLength(1);
    expect(g.selectAll('.known-issue-arrow').nodes()).toHaveLength(0);
  });

  it('re-rendering replaces the previous annotations instead of accumulating', () => {
    renderKnownIssueAnnotations(g, defs, baseOptions());
    renderKnownIssueAnnotations(g, defs, baseOptions({ annotations: [gb300Annotation] }));

    expect(g.selectAll('[data-testid="known-issue-annotation"]').nodes()).toHaveLength(1);
    expect(defs.selectAll('marker').nodes()).toHaveLength(1);
  });

  it('fires the click callback with the annotation', () => {
    const onLinkClick = vi.fn();
    renderKnownIssueAnnotations(g, defs, baseOptions({ onLinkClick }));

    const box = g.select('[data-testid="known-issue-annotation"]').node() as SVGAElement;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onLinkClick).toHaveBeenCalledWith(gb300Annotation);
  });
});
