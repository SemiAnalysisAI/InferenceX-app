/**
 * Box of an SVG element, or null for anything else. Bilingual translation extensions clone chart
 * text into HTML nodes that keep its class, so a class query can return a node without `getBBox`.
 */
export function svgBBox(element: Element | null): DOMRect | null {
  return element instanceof SVGElement && 'getBBox' in element
    ? (element as SVGGraphicsElement).getBBox()
    : null;
}
