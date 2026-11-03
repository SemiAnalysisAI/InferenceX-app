// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import type { EvaluationChartData } from '../types';
import {
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
      { dp: undefined, expected: false },
      { dp: 1, expected: false },
      { dp: 8, expected: true },
    ])(
      `shows only non-default DP in ${unofficialBranch ? 'unofficial' : 'official'} details ($dp)`,
      ({ dp, expected }) => {
        const { rows } = evaluationPointDetails(
          { ...makeDatum('TPU7x (vLLM)', 0.9), dp, physicalChips: 4 },
          unofficialBranch,
        );
        expect(rows).toContainEqual({ label: 'Chips', value: '4' });
        expect(rows.some((row) => row.label === 'DP' && row.value === '8')).toBe(expected);
      },
    );
  }

  it('keeps the hover card compact and the full breakdown in the details', () => {
    const html = generateEvaluationTooltipContent(makeDatum('B200 SGLang', 0.9), '#000');
    expect(html).toContain('0.9000');
    expect(html).toContain('2026-01-01');
    expect(html).not.toContain('Min score');
    expect(html).not.toContain('Click elsewhere');
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
    expect(details.warning).toContain('非官方运行');
    expect(details.metrics[0].label).toBe('平均得分');
    expect(details.rows).toContainEqual({ label: '并发数', value: '1' });
    expect(details.links[0]).toMatchObject({
      label: 'GitHub Actions 运行记录',
      href: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
    });
    expect(JSON.stringify(details)).not.toContain('Mean score');
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
