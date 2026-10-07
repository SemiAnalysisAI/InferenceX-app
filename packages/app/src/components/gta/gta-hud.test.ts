import { describe, expect, it } from 'vitest';
import { beginTour, newCity } from './gta-engine';
import { objectiveStatus } from './gta-hud';

const copy = { blockedExit: 'blocked', escape: 'wanted', aim: 'drive', arrived: 'arrived' };

describe('GTA objective status', () => {
  it.each([null, 6])('prioritizes a blocked exit over wanted and navigation in mode %s', (tour) => {
    const state = { ...newCity(), tour, heat: 2, message: 'blocked' as const };
    expect(objectiveStatus(state, copy)).toEqual({ text: 'blocked', warning: true });
  });

  it.each([null, 6])('shows wanted warnings instead of navigation in mode %s', (tour) => {
    const state = { ...newCity(), tour, heat: 2 };
    expect(objectiveStatus(state, copy)).toEqual({ text: 'wanted', warning: true });
  });

  it('keeps GPS guidance until arrival', () => {
    const state = newCity();
    beginTour(state, 6);
    expect(objectiveStatus(state, copy).text).toMatch(/^\d+ m · GPS$/);
    expect(objectiveStatus(state, copy).warning).toBe(false);
  });

  it('shows arrival when no warning needs attention', () => {
    const state = newCity();
    beginTour(state, 6, true);
    expect(objectiveStatus(state, copy)).toEqual({ text: 'arrived', warning: false });
  });

  it('preserves ordinary mission guidance', () => {
    expect(objectiveStatus(newCity(), copy)).toEqual({ text: 'drive', warning: false });
  });

  it('keeps flight altitude separate from city warnings', () => {
    const state = { ...newCity(), explorer: true, altitude: 800.4, heat: 2 };
    expect(objectiveStatus(state, copy)).toEqual({ text: '800 m', warning: false });
  });
});
