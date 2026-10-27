import {
  decodeLadderHardware,
  encodeLadderHardware,
  type LadderHardware,
} from '@/lib/powerx/ladder';

import { createSharedHashState } from './widget-chrome';

/** The chip the hero picks; the load strip and the worked example follow it. Hash key `hw`. */
export const hardwareStore = createSharedHashState<LadderHardware>(
  'hw',
  encodeLadderHardware,
  decodeLadderHardware,
);
