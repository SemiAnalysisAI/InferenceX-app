import { act, useEffect } from 'react';

import {
  usePowerXCompareTarget,
  useSetPowerXCompareRange,
  useSetPowerXCompareTarget,
} from '@/components/inference/ui/powerx-surface';
import { readUrlParams, writeUrlParams } from '@/lib/routing/url-state';

/**
 * A test handle on the shell's Compare at: render `<CompareAtProbe />` inside
 * `PowerXSurfaceProvider` to read the resolved value and pick a new one. `range` publishes the
 * covered interactivity range, as ChartDisplay does, so the default clamps into it.
 */
export const compareAt: {
  value: number | null;
  set: ((value: number | null) => void) | null;
} = { value: null, set: null };

export function CompareAtProbe({ range }: { range?: readonly [number, number] }) {
  compareAt.value = usePowerXCompareTarget();
  compareAt.set = useSetPowerXCompareTarget();
  const setRange = useSetPowerXCompareRange();
  const [low, high] = range ?? [null, null];
  useEffect(() => {
    if (low !== null && high !== null) setRange?.([low, high]);
  }, [low, high, setRange]);
  return null;
}

/** Picks Compare at, as the shell's control does. */
export function setCompareAt(value: number): void {
  act(() => compareAt.set!(value));
}

/** Clears `i_at` so each test starts at the default Compare at. */
export function resetCompareAt(): void {
  writeUrlParams({ i_at: '' });
  readUrlParams();
  compareAt.value = null;
  compareAt.set = null;
}
