import * as d3 from 'd3';

export function showPinRing(host: Element, x: number, y: number): void {
  const parent = d3.select(host);
  let ring = parent.select<SVGGElement>(':scope > .pin-ring');
  if (ring.empty()) {
    ring = parent
      .append('g')
      .attr('class', 'pin-ring')
      .attr('data-testid', 'chart-pin-ring')
      .style('pointer-events', 'none');
    ring
      .append('circle')
      .attr('r', 11)
      .attr('fill', 'none')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 2);
    ring
      .append('circle')
      .attr('r', 9)
      .attr('fill', 'none')
      .attr('stroke', 'var(--foreground)')
      .attr('stroke-width', 2);
  }
  ring.attr('transform', `translate(${x},${y})`).raise();
}

export function clearPinRing(svg: SVGSVGElement | null): void {
  if (svg) d3.select(svg).selectAll('.pin-ring').remove();
}
