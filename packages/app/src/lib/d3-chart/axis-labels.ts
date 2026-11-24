import * as d3 from 'd3';

import { splitLabel, type LabelSplitMode } from './label-split';
import { CHART_TYPE, px } from './typography';

export interface TwoRowLabelOptions {
  split?: LabelSplitMode;
  yOffset?: number;
  primarySize?: string;
  secondarySize?: string;
}

export function twoRowYAxisLabels(options: TwoRowLabelOptions | number = {}) {
  const opts = typeof options === 'number' ? { yOffset: options } : options;
  const {
    split = 'last-space',
    yOffset = 0,
    primarySize = px(CHART_TYPE.axisLabel),
    secondarySize = px(CHART_TYPE.axisLabel),
  } = opts;

  return (axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    axisGroup.selectAll('.tick text').each(function () {
      const el = d3.select(this as SVGTextElement);
      const fullLabel = el.text();
      const [primary, secondary] = splitLabel(fullLabel, split);
      el.text(null);
      if (yOffset !== 0) {
        el.attr('transform', `translate(0, ${yOffset})`);
      }
      if (secondary) {
        el.append('tspan')
          .text(primary)
          .attr('x', -8)
          .attr('dy', '-0.4em')
          .attr('font-size', primarySize)
          .attr('font-weight', '500');
        el.append('tspan')
          .text(secondary)
          .attr('x', -8)
          .attr('dy', '1.2em')
          .attr('font-size', secondarySize)
          .style('fill', 'var(--muted-foreground)');
      } else {
        el.append('tspan')
          .text(primary)
          .attr('x', -8)
          .attr('font-size', primarySize)
          .attr('font-weight', '500');
      }
      el.attr('text-anchor', 'end');
    });
  };
}
