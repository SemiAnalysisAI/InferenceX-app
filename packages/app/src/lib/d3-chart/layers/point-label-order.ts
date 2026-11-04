export const replacedPointShapes = new WeakSet<Element>();

export function pointLabelAnchor(group: Element): Element | null {
  for (let child = group.firstElementChild; child; child = child.nextElementSibling) {
    if (child.classList.contains('offload-halo') || replacedPointShapes.has(child)) return child;
  }
  return null;
}
