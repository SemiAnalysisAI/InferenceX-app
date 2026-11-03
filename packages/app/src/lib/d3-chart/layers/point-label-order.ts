export const replacedPointShapes = new WeakSet<Element>();

export function pointLabelAnchor(group: Element): Element | null {
  for (const child of group.children) {
    if (child.classList.contains('offload-halo') || replacedPointShapes.has(child)) return child;
  }
  return null;
}
