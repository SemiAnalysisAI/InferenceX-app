import * as d3 from 'd3';

export type LabelSplitMode = 'last-space' | 'newline' | 'parens';

export interface TwoRowLabelOptions {
  /** How to split labels into rows. Default: 'last-space' */
  split?: LabelSplitMode;
  /** Vertical offset in px. Default: 0 */
  yOffset?: number;
  /** CSS font-size for the first row. Default: '12px' */
  primarySize?: string;
  /** CSS font-size for the second row. Default: '10px' */
  secondarySize?: string;
}

/**
 * Split a label into [primary, secondary] based on the split mode.
 * - 'last-space': splits at the last space
 * - 'newline': splits at first \n (remaining lines joined with spaces)
 * - 'parens': splits "Base (suffix)" into ["Base", "(suffix)"]
 */
export function splitLabel(label: string, mode: LabelSplitMode): [string, string | null] {
  if (mode === 'newline') {
    const idx = label.indexOf('\n');
    if (idx === -1) return [label, null];
    return [label.slice(0, idx), label.slice(idx + 1).replaceAll('\n', ' ')];
  }
  if (mode === 'parens') {
    const match = label.match(/^(.+?)(\s*\(.+\))$/);
    if (!match) return [label, null];
    return [match[1], match[2].trim()];
  }
  // last-space
  const lastSpace = label.lastIndexOf(' ');
  if (lastSpace <= 0) return [label, null];
  return [label.slice(0, lastSpace), label.slice(lastSpace + 1)];
}

/**
 * Y-axis label customizer that splits labels into two rows.
 * First row: bold (font-weight 600).
 * Second row: muted (muted-foreground).
 *
 * Supports three split modes: last-space, newline, and parens.
 */
export function twoRowYAxisLabels(options: TwoRowLabelOptions | number = {}) {
  // Backwards compat: accept bare number as yOffset
  const opts = typeof options === 'number' ? { yOffset: options } : options;
  const { split = 'last-space', yOffset = 0, primarySize = '12px', secondarySize = '10px' } = opts;

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
          .attr('font-weight', '600');
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
          .attr('font-weight', '600');
      }
      el.attr('text-anchor', 'end');
    });
  };
}
