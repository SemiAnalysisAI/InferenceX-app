'use client';

import { useSyncExternalStore } from 'react';
import { getClientSearchSnapshot, subscribeClientSearch } from '@/hooks/useClientSearch';
import { parseStage, type StageState } from './clip-stage';

/**
 * One stage key of the address. A change to another key does not render the caller again, so the
 * clips are not rendered when a chart point's sheet opens, nor the chart when the prompt changes.
 */
export function useStageValue<Key extends keyof StageState>(key: Key): StageState[Key] {
  return useSyncExternalStore(
    subscribeClientSearch,
    () => parseStage(getClientSearchSnapshot())[key],
    () => parseStage('')[key],
  );
}
