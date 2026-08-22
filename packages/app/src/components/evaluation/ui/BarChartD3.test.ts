// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import type { EvaluationChartData } from '../types';
import { sizeScoreLabelBackgrounds } from './BarChartD3';

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
