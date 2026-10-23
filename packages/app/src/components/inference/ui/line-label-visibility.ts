export interface LabelAttrs {
  hwKey?: string;
  lineKey?: string;
  precision?: string;
  visible?: string;
}

const renderKept = (attrs: LabelAttrs): boolean => attrs.visible !== '0';

export const labelOpacityForHover = (attrs: LabelAttrs, hoveredHwKey: string): 0 | 1 => {
  if (!attrs.hwKey) return 0;
  if (!renderKept(attrs)) return 0;
  return attrs.hwKey === hoveredHwKey ? 1 : 0;
};

export const labelOpacityForActiveState = (
  attrs: LabelAttrs,
  activeHwTypes: ReadonlySet<string>,
  selectedPrecisions: readonly string[],
  activeOverlayHwTypes?: ReadonlySet<string>,
): 0 | 1 => {
  const { hwKey, precision } = attrs;
  if (!hwKey) return 0;
  const isOverlay = attrs.lineKey?.startsWith('overlay-') ?? false;
  const active = isOverlay && activeOverlayHwTypes ? activeOverlayHwTypes : activeHwTypes;
  if (!precision) {
    return active.has(hwKey) && renderKept(attrs) ? 1 : 0;
  }
  return active.has(hwKey) && selectedPrecisions.includes(precision) ? 1 : 0;
};
