import { target, type CityState } from './gta-engine';
import { distance, type World } from './gta-world';

interface ObjectiveCopy {
  blockedExit: string;
  escape: string;
  aim: string;
  arrived: string;
}

export function objectiveStatus(world: World, state: CityState, copy: ObjectiveCopy) {
  if (state.explorer) return { text: `${Math.round(state.altitude)} m`, warning: false };
  if (state.message === 'blocked') return { text: copy.blockedExit, warning: true };
  if (state.heat) return { text: copy.escape, warning: true };
  const meters = distance(state.player, target(world, state));
  return {
    text:
      state.tour === null
        ? `${copy.aim} · ${Math.round(meters)} m`
        : meters < 18
          ? copy.arrived
          : `${Math.round(meters)} m · GPS`,
    warning: false,
  };
}
