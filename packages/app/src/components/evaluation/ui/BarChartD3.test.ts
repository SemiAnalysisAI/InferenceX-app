// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import type { EvaluationChartData } from '../types';
import {
  evaluationChartBlockingState,
  evaluationChartIsInitializing,
  sizeScoreLabelBackgrounds,
} from './BarChartD3';
import * as barChartModule from './BarChartD3';

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
  it('preserves the raw English tooltip date while formatting the Chinese date', () => {
    const module = barChartModule as typeof barChartModule & {
      formatEvaluationDate?: (date: string, locale: 'en' | 'zh') => string;
      formatEvaluationEmptyStateDate?: (date: string, locale: 'en' | 'zh') => string;
      generateEvaluationTooltipContent?: (
        data: EvaluationChartData,
        isPinned: boolean,
        unofficialBranch: string | undefined,
        locale: 'en' | 'zh',
      ) => string;
    };

    expect(module.formatEvaluationDate?.('2026-01-02', 'en')).toBe('2026-01-02');
    expect(module.formatEvaluationDate?.('2026-01-02', 'zh')).toBe('2026年1月2日');
    expect(module.formatEvaluationEmptyStateDate?.('2026-01-02', 'en')).toBe('Jan 2, 2026');
    expect(module.formatEvaluationEmptyStateDate?.('2026-01-02', 'zh')).toBe('2026年1月2日');
    const englishHtml = module.generateEvaluationTooltipContent?.(
      makeDatum('B200 SGLang', 0.9),
      false,
      undefined,
      'en',
    );
    expect(englishHtml).toContain('<strong>Date:</strong> 2026-01-01');
    const html = module.generateEvaluationTooltipContent?.(
      {
        ...makeDatum('B200 SGLang', 0.9),
        runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
      },
      true,
      'feature/zh',
      'zh',
    );
    expect(html).toContain('点击其他区域关闭');
    expect(html).toContain('非官方运行');
    expect(html).toContain('<strong>平均得分：</strong>');
    expect(html).toContain('<strong>并发数：</strong>');
    expect(html).toContain('GitHub Actions 运行记录');
    expect(html).not.toContain('Mean Score');
    expect(html).not.toContain('Concurrency');
  });
});

describe('evaluation chart blocking state', () => {
  it('keeps valid chart data visible when only aggregate availability metadata failed', () => {
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
    ).toBe('data-error');
  });
});

describe('evaluation chart initialization state', () => {
  it('stops showing the loading skeleton after a successful empty response settles', () => {
    expect(
      evaluationChartIsInitializing({
        loading: true,
        isEvaluationDataSettled: false,
      }),
    ).toBe(true);
    expect(
      evaluationChartIsInitializing({
        loading: false,
        isEvaluationDataSettled: true,
      }),
    ).toBe(false);
  });
});
