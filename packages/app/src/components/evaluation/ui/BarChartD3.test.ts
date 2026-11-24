// @test-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'bun:test';

import type { ChartLayout } from '@/lib/d3-chart/types';
import { renderTopAxis, stickTopAxis, unstickTopAxis } from '@/lib/d3-chart/sticky-top-axis';
import type { EvaluationChartData } from '../types';
import {
  drawScoreAxisBreak,
  evaluationChartBlockingState,
  evaluationChartIsInitializing,
  evaluationPointDetails,
  formatEvaluationDate,
  formatEvaluationEmptyStateDate,
  generateEvaluationTooltipContent,
  sizeScoreLabelBackgrounds,
} from './BarChartD3';

function makeDatum(configLabel: string, score: number): EvaluationChartData {
  return {
    evalResultId: score,
    configId: score,
    hwKey: configLabel,
    hardware: configLabel,
    hwLabel: configLabel,
    engineLabel: '',
    configLabel,
    score,
    model: 'model',
    benchmark: 'benchmark',
    specDecode: 'none',
    date: '2026-01-01',
    datetime: '2026-01-01T00:00:00Z',
    precision: 'fp8',
    framework: 'framework',
    tp: 1,
    ep: 1,
    dp_attention: false,
    conc: 1,
    disagg: false,
    isMultinode: false,
    prefillTp: 1,
    prefillEp: 1,
    prefillDpAttention: false,
    prefillNumWorkers: 1,
    decodeNumWorkers: 1,
    numPrefillGpu: 0,
    numDecodeGpu: 1,
  };
}

describe('sizeScoreLabelBackgrounds', () => {
  it('finishes every text measurement before writing any label background geometry', () => {
    const svg = d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const root = svg.append('g');
    const labelGroups = root
      .selectAll<SVGGElement, EvaluationChartData>('.score-label-group')
      .data([makeDatum('a', 1), makeDatum('b', 2)])
      .join('g')
      .attr('class', 'score-label-group');
    labelGroups.append('text').attr('class', 'score-label');

    const events: string[] = [];
    labelGroups.each(function (_datum, index) {
      const text = this.querySelector<SVGTextElement>('.score-label')!;
      Object.defineProperty(text, 'getBBox', {
        value: () => {
          events.push(`read:${index}`);
          return new DOMRect(index, index + 1, 10 + index, 5 + index);
        },
      });
      const insertBefore = this.insertBefore.bind(this);
      Object.defineProperty(this, 'insertBefore', {
        value: (node: Node, child: Node | null) => {
          events.push(`write:${index}`);
          return insertBefore(node, child);
        },
      });
    });

    sizeScoreLabelBackgrounds(labelGroups);

    expect(events).toEqual(['read:0', 'read:1', 'write:0', 'write:1']);
    expect(labelGroups.select('.score-label-bg').attr('width')).toBe('20');
  });
});

describe('evaluation chart locale presentation', () => {
  for (const unofficialBranch of [undefined, 'tpuv7_updates']) {
    it.each([
      { dp: undefined, expected: '?' },
      { dp: 1, expected: '1' },
      { dp: 8, expected: '8' },
    ])(
      `shows DP, unknown included, in ${unofficialBranch ? 'unofficial' : 'official'} details ($dp)`,
      ({ dp, expected }) => {
        const { rows } = evaluationPointDetails(
          { ...makeDatum('TPU7x (vLLM)', 0.9), dp, physicalChips: 4 },
          unofficialBranch,
        );
        expect(rows).toContainEqual({ label: 'Chips', value: '4' });
        expect(rows).toContainEqual({ label: 'DP', value: expected });
        expect(rows).toContainEqual({ label: 'Multinode', value: 'False' });
      },
    );
  }

  it('keeps the hover card compact and the full breakdown in the details', () => {
    const html = generateEvaluationTooltipContent(makeDatum('B200 SGLang', 0.9), '#000');
    expect(html).toContain('0.9000');
    expect(html).toContain('2026-01-01');
    expect(html).not.toContain('Min Score');
    expect(html).not.toContain('Click elsewhere');
  });

  it('builds the overlay hover card and details from the official builders plus the notice', () => {
    const datum = makeDatum('B200 SGLang', 0.9);
    const official = generateEvaluationTooltipContent(datum, '#000');
    const overlay = generateEvaluationTooltipContent(datum, '#000', 'feat/x');
    const notice =
      '<div data-hover-notice style="color: #dc2626; font-size: 11px; font-weight: 600; margin-bottom: 4px;">✕ feat/x</div>';
    expect(overlay.replace(notice, '')).toBe(official);

    const { warning, rows, ...overlayFields } = evaluationPointDetails(datum, 'feat/x');
    const {
      warning: officialWarning,
      rows: officialRows,
      ...officialFields
    } = evaluationPointDetails(datum);
    expect(officialWarning).toBeUndefined();
    expect(warning).toBe('✕ feat/x');
    expect(overlayFields).toEqual(officialFields);
    expect(rows).toEqual(officialRows);
    expect(
      evaluationPointDetails(
        { ...datum, runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123' },
        '',
      ).warning,
    ).toBe('✕ #123');
    expect(evaluationPointDetails(datum, '', 'zh').warning).toBe('✕ 非官方运行');
  });

  it('preserves the raw English date while formatting the Chinese date', () => {
    expect(formatEvaluationDate('2026-01-02', 'en')).toBe('2026-01-02');
    expect(formatEvaluationDate('2026-01-02', 'zh')).toBe('2026年1月2日');
    expect(formatEvaluationEmptyStateDate('2026-01-02', 'en')).toBe('Jan 2, 2026');
    expect(formatEvaluationEmptyStateDate('2026-01-02', 'zh')).toBe('2026年1月2日');
    expect(evaluationPointDetails(makeDatum('B200 SGLang', 0.9)).date).toBe('2026-01-01');
    const details = evaluationPointDetails(
      {
        ...makeDatum('B200 SGLang', 0.9),
        runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
      },
      'feature/zh',
      'zh',
    );
    expect(details.warning).toBe('✕ feature/zh');
    expect(details.metrics[0].label).toBe('平均得分');
    expect(details.rows).toContainEqual({ label: '并发数', value: '1' });
    expect(details.links[0]).toMatchObject({
      label: 'GitHub Actions 运行记录',
      href: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
    });
    expect(JSON.stringify(details)).not.toContain('Mean Score');
    expect(JSON.stringify(details)).not.toContain('Concurrency');
  });
});

describe('evaluation chart blocking state', () => {
  it('keeps valid official or unofficial chart data visible when either query failed', () => {
    expect(
      evaluationChartBlockingState({
        hasChartData: true,
        isEvaluationDataError: false,
      }),
    ).toBeNull();
    expect(
      evaluationChartBlockingState({
        hasChartData: true,
        isEvaluationDataError: true,
      }),
    ).toBeNull();
    expect(
      evaluationChartBlockingState({
        hasChartData: false,
        isEvaluationDataError: true,
      }),
    ).toBe('data-error');
  });
});

describe('evaluation chart initialization state', () => {
  it('shows the loading skeleton until the evaluation query settles', () => {
    expect(
      evaluationChartIsInitializing({
        isEvaluationDataSettled: false,
      }),
    ).toBe(true);
    expect(
      evaluationChartIsInitializing({
        isEvaluationDataSettled: true,
      }),
    ).toBe(false);
  });
});

/** Vertical span a break mark's cover rect takes in its axis group, transform included. */
const coverSpan = (mark: Element) => {
  const transform = mark.getAttribute('transform') ?? '';
  const shift = Number(/translate\([^,]+,(?<y>[^)]+)\)/u.exec(transform)?.groups?.y ?? 0);
  const rect = mark.querySelector('rect')!;
  const top = shift + Number(rect.getAttribute('y'));
  return [top, top + Number(rect.getAttribute('height'))];
};
const covers = ([top, bottom]: number[], y: number) => top <= y && y <= bottom;
const placeSvg = (svgNode: SVGSVGElement, top: number) =>
  Object.defineProperty(svgNode, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, top, 824, 2102),
  });

describe('score axis break on the sticky top axis', () => {
  it('covers the pinned axis line in the gap, and the plot border at rest', () => {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svgNode);
    const svg = d3.select(svgNode);
    const g = svg.append('g');
    const layout = {
      svg,
      g,
      zoomGroup: g.append('g'),
      xAxisGroup: g.append('g').attr('class', 'x-axis'),
      width: 600,
      height: 2000,
      margin: { top: 50, right: 24, bottom: 52, left: 200 },
    } as unknown as ChartLayout;
    const xScale = d3.scaleLinear().domain([0, 1]).range([0, 600]);
    renderTopAxis(layout, xScale, { tickCount: 5, tickFormat: String });
    drawScoreAxisBreak(layout.zoomGroup, xScale, layout.height, [0.1, 0.13]);

    const topMark = svgNode.querySelector('.x-axis-top .evaluation-axis-break-mark')!;
    const bottomMark = svgNode.querySelector('.x-axis .evaluation-axis-break-mark')!;
    const edgeY = Number(svgNode.querySelector('.x-axis-top-edge')!.getAttribute('y1'));

    // Scrolled far past the plot top, so the axis is pinned and its edge line is the axis line.
    placeSvg(svgNode, -800);
    stickTopAxis(svgNode);
    expect(covers(coverSpan(topMark), edgeY)).toBe(true);
    expect(covers(coverSpan(bottomMark), 0)).toBe(true);

    // At rest the top axis shows no line of its own, so the mark sits on the plot's top border.
    placeSvg(svgNode, 400);
    stickTopAxis(svgNode);
    expect(covers(coverSpan(topMark), 0)).toBe(true);

    placeSvg(svgNode, -800);
    stickTopAxis(svgNode);
    unstickTopAxis(layout);
    expect(covers(coverSpan(topMark), 0)).toBe(true);
    svgNode.remove();
  });
});
