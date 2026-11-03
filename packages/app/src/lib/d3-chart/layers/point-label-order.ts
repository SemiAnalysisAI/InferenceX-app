/**
 * Scatter point labels are built only while visible. A label created after its point keeps
 * the stacking slot it would have had if built with the point: after the hit area, the
 * original shape and anything inserted ahead of labels (theme markers), and before what
 * is appended later (offload halos, shapes re-created for a new precision).
 */
export const replacedPointShapes = new WeakSet<Element>();

export function pointLabelAnchor(group: Element): Element | null {
  for (const child of group.children) {
    if (child.classList.contains('offload-halo') || replacedPointShapes.has(child)) return child;
  }
  return null;
}
