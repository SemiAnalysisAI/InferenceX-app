import * as d3 from 'd3';

/**
 * Y-axis label customizer that splits labels into two rows at the last space.
 * First row: bold vendor/prefix (12px, font-weight 600).
 * Second row: muted model name (10px, muted-foreground).
 *
 * If the label has no spaces, renders a single bold line.
 *
 * @param yOffset - Optional vertical offset in px (default: 0).
 */
export function twoRowYAxisLabels(yOffset = 0) {
  return (axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    axisGroup.selectAll('.tick text').each(function () {
      const el = d3.select(this as SVGTextElement);
      const fullLabel = el.text();
      const lastSpace = fullLabel.lastIndexOf(' ');
      el.text(null);
      if (yOffset !== 0) {
        el.attr('transform', `translate(0, ${yOffset})`);
      }
      if (lastSpace > 0) {
        el.append('tspan')
          .text(fullLabel.slice(0, lastSpace))
          .attr('x', -8)
          .attr('dy', '-0.4em')
          .attr('font-size', '12px')
          .attr('font-weight', '600');
        el.append('tspan')
          .text(fullLabel.slice(lastSpace + 1))
          .attr('x', -8)
          .attr('dy', '1.2em')
          .attr('font-size', '10px')
          .style('fill', 'var(--muted-foreground)');
      } else {
        el.append('tspan')
          .text(fullLabel)
          .attr('x', -8)
          .attr('font-size', '12px')
          .attr('font-weight', '600');
      }
      el.attr('text-anchor', 'end');
    });
  };
}
