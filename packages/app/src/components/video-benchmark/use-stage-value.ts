'use client';

import { useSyncExternalStore } from 'react';
import { parseStage, type StageState } from './clip-stage';
import { subscribeVideoSearch, videoSearch } from './page-search';

/**
 * One stage key of the page's settings. A change to another key does not render the caller again,
 * so the clips are not rendered when a chart point's sheet opens, nor the chart when the prompt
 * changes.
 */
export function useStageValue<Key extends keyof StageState>(key: Key): StageState[Key] {
  return useSyncExternalStore(
    subscribeVideoSearch,
    () => parseStage(videoSearch())[key],
    () => parseStage('')[key],
  );
}
