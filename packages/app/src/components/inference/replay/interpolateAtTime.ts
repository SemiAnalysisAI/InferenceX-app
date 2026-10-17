export interface PerStepValue {
  visible: boolean;
  x: number;
  y: number;
}

// A new configuration appears only at its first observed snapshot, never early.
export function interpolateAtStep(
  stepValues: readonly PerStepValue[],
  idxFloat: number,
): PerStepValue {
  const n = stepValues.length;
  if (n === 0) return { visible: false, x: 0, y: 0 };

  const clamped = Math.max(0, Math.min(n - 1, idxFloat));
  const idxLow = Math.min(n - 1, Math.floor(clamped));
  const idxHigh = Math.min(n - 1, idxLow + 1);
  const a = stepValues[idxLow];
  const b = stepValues[idxHigh];

  if (idxLow === idxHigh) return { visible: a.visible, x: a.x, y: a.y };
  if (!a.visible && !b.visible) return { visible: false, x: 0, y: 0 };
  if (a.visible && !b.visible) return { visible: true, x: a.x, y: a.y };
  if (!a.visible && b.visible) return { visible: false, x: 0, y: 0 };

  const frac = clamped - idxLow;
  return {
    visible: true,
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
  };
}
