// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('@/hooks/useMediaQuery', async (original) => ({
  ...((await original()) as object),
  useIsCoarsePointer: () => false,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import type { StageOption } from './clip-stage';
import type { VideoPoint } from './metrics';
import type { ResultCell } from './results';
import VideoClipReadout, { type ReadoutSide } from './VideoClipReadout';
import type { StageClip } from './VideoClipStage';

const side = (
  name: string,
  perVideo: number | null,
  energyKj: number | null,
  p50 = 40,
): ReadoutSide => ({
  name,
  pill: { id: name.toLowerCase(), label: name, color: '#123456' } as StageClip,
  point: { hardwareKey: name.toLowerCase(), p50, energyKj, participating: 4 } as VideoPoint,
  clip: null,
  cost: {
    participating:
      perVideo === null ? null : { perVideo, perVideoSecond: perVideo / 5, perHour: 1 },
    allocated: null,
  } as ResultCell['cost'],
});

/** Each cell's lines after its label: the value, then the pair's line. */
function lines(a: ReadoutSide, b: ReadoutSide, kind: StageOption['kind'] = 'hardware') {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<VideoClipReadout kind={kind} a={a} b={b} diagnostic={false} />));
  const cells = Object.fromEntries(
    [...host.querySelectorAll<HTMLElement>('[data-metric]')].map((cell) => [
      cell.dataset.metric,
      [...cell.querySelectorAll('dd')].map((line) => line.textContent),
    ]),
  );
  const labels = Object.fromEntries(
    [...host.querySelectorAll<HTMLElement>('[data-metric]')].map((cell) => [
      cell.dataset.metric,
      cell.querySelector('dt')?.textContent,
    ]),
  );
  const help = host.querySelector('[data-metric="cost"]')?.getAttribute('title');
  act(() => root.unmount());
  return { cells, labels, help };
}

describe('VideoClipReadout', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    mocks.locale = 'en';
  });

  it('says in plain words how the subject’s cost and energy stand against the other GPU', () => {
    const { cells, labels } = lines(side('B200', 0.0682, 138.497), side('H100', 0.0964, 206.097));
    expect(cells.cost).toEqual(['$0.068', '29% cheaper than H100 · $0.096']);
    expect(cells.energy).toEqual(['138 kJ', '33% less energy than H100 · 206 kJ']);
    // The qualifier that was a line of its own is part of the label.
    expect(labels.energy).toBe('Mean energy per clip');
  });

  it('words a worse value, a tie and a gap of twice or more', () => {
    const worse = lines(side('H100', 0.0964, 206.097), side('B200', 0.0682, 138.497)).cells;
    expect(worse.cost[1]).toBe('41% pricier than B200 · $0.068');
    expect(worse.energy[1]).toBe('49% more energy than B200 · 138 kJ');
    const tie = lines(side('B200', 0.07, 100), side('H200', 0.07, 100.2)).cells;
    expect(tie.cost[1]).toBe('Same cost as H200 · $0.070');
    expect(tie.energy[1]).toBe('Same energy as H200 · 100 kJ');
    const apart = lines(side('B200', 0.05, 100), side('H100', 0.125, 250)).cells;
    expect(apart.cost[1]).toBe('2.5× cheaper than H100 · $0.125');
    expect(apart.energy[1]).toBe('2.5× less energy than H100 · 250 kJ');
    const behind = lines(side('H100', 0.125, 250), side('B200', 0.05, 100)).cells;
    expect(behind.cost[1]).toBe('2.5× the cost of B200 · $0.050');
    expect(behind.energy[1]).toBe('2.5× the energy of B200 · 100 kJ');
  });

  it('compares nothing when either side has no value, and never compares wall time or PSNR', () => {
    const noBaseline = lines(side('B200', 0.0682, 138.497), side('H100', null, null)).cells;
    expect(noBaseline.cost).toEqual(['$0.068', 'H100 Not measured yet']);
    expect(noBaseline.energy).toEqual(['138 kJ', 'H100 Not measured yet']);
    const noSubject = lines(side('B200', null, null), side('H100', 0.0964, 206.097)).cells;
    expect(noSubject.cost).toEqual(['Not measured yet', 'H100 $0.096']);
    // One prompt's wall times are not divided, and there is no cross-GPU quality score.
    expect(noSubject.wall).toEqual(['Not measured yet', 'H100 Not measured yet']);
    expect(noSubject.psnr).toEqual(['Not measured yet', 'H100 Not measured yet']);
  });

  it('shows one value and no pair line against the reference, with the rest in the help', () => {
    const { cells, help } = lines(
      side('B200', 0.0682, 138.497),
      { ...side('Diffusers reference', null, null), point: null },
      'reference',
    );
    expect(cells.cost).toEqual(['$0.068']);
    expect(cells.energy).toEqual(['138 kJ']);
    expect(help).toContain('$0.014 per video-second');
    expect(help).toContain('On the allocated GPUs: not measured yet.');
  });

  it('reads the same in Chinese', () => {
    mocks.locale = 'zh';
    const better = lines(side('B200', 0.0682, 138.497), side('H100', 0.0964, 206.097));
    expect(better.cells.cost[1]).toBe('比 H100 低 29% · $0.096');
    expect(better.cells.energy[1]).toBe('比 H100 低 33% · 206 kJ');
    expect(better.labels.energy).toBe('每条视频平均能耗');
    const worse = lines(side('H100', 0.125, 100.2), side('B200', 0.05, 100)).cells;
    expect(worse.cost[1]).toBe('为 B200 的 2.5 倍 · $0.050');
    expect(worse.energy[1]).toBe('与 B200 相同 · 100 kJ');
    // A saving stays a percentage in Chinese, however large.
    expect(lines(side('B200', 0.05, 100), side('H100', 0.125, 150)).cells.cost[1]).toBe(
      '比 H100 低 60% · $0.125',
    );
  });
});
