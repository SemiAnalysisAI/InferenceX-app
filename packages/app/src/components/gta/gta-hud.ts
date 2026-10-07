import { target, type CityState } from './gta-engine';
import { distance } from './gta-world';

interface ObjectiveCopy {
  blockedExit: string;
  escape: string;
  aim: string;
  arrived: string;
}

export function objectiveStatus(state: CityState, copy: ObjectiveCopy) {
  if (state.explorer) return { text: `${Math.round(state.altitude)} m`, warning: false };
  if (state.message === 'blocked') return { text: copy.blockedExit, warning: true };
  if (state.heat) return { text: copy.escape, warning: true };
  if (state.tour === null) return { text: copy.aim, warning: false };
  const meters = distance(state.player, target(state));
  return {
    text: meters < 18 ? copy.arrived : `${Math.round(meters)} m · GPS`,
    warning: false,
  };
}
