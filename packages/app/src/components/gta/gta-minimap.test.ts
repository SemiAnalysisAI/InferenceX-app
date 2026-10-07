import { describe, expect, it, vi } from 'vitest';
import { paintOverview } from './gta-minimap';
import type { World } from './gta-world';

const render = (done: number, selected: number) => {
  const colors: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    stroke: vi.fn(),
    fill() {
      colors.push(this.fillStyle);
    },
  };
  paintOverview(
    { width: 360, height: 400, getContext: () => ctx } as unknown as HTMLCanvasElement,
    { width: 360, height: 400 } as HTMLCanvasElement,
    { x0: 0, z0: 0 } as World,
    [
      { x: 0, z: 0 },
      { x: 1, z: 1 },
      { x: 2, z: 2 },
    ],
    done,
    { x: 0, z: 0 },
    selected,
  );
  return { colors: colors.slice(0, 3), ctx };
};
describe('overview pin progress', () => {
  it('highlights a sightseeing destination without completing earlier stops', () => {
    const { colors, ctx } = render(0, 2);
    expect(colors).toEqual(['#ffd23f', '#ffd23f', '#ffd23f']);
    expect(ctx.stroke).toHaveBeenCalledTimes(2); // Selected pin and player.
  });
  it('keeps completed mission pins gray', () => {
    expect(render(2, 2).colors).toEqual(['#6b7280', '#6b7280', '#ffd23f']);
  });
});
