import { describe, it, expect, vi, beforeEach } from 'vitest';

import { contrastColors } from './contrast-colors';

// Mock canvas for color probing
const mockImageData = { data: new Uint8ClampedArray([0, 0, 0, 255]) };
const mockCtx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  getImageData: vi.fn(() => mockImageData),
  set fillStyle(_: string) {
    /* noop — the test controls output via mockImageData */
  },
};

beforeEach(() => {
  vi.stubGlobal('document', {
    documentElement: {},
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => mockCtx,
    })),
  });
  vi.stubGlobal(
    'getComputedStyle',
    vi.fn(() => ({
      getPropertyValue: (name: string) => {
        const vars: Record<string, string> = {
          '--light-color': '#f0f0f0',
          '--dark-color': '#1a1a1a',
        };
        return vars[name] ?? '';
      },
    })),
  );
});

function setProbeColor(r: number, g: number, b: number) {
  mockImageData.data[0] = r;
  mockImageData.data[1] = g;
  mockImageData.data[2] = b;
}

describe('contrastColors', () => {
  it('returns dark text for light backgrounds', () => {
    setProbeColor(240, 240, 240);
    expect(contrastColors('#f0f0f0')).toBe('#131416');
  });

  it('returns white text for dark backgrounds', () => {
    setProbeColor(26, 26, 26);
    expect(contrastColors('#1a1a1a')).toBe('white');
  });

  it('returns dark text for medium-luminance colors like nvidia green', () => {
    setProbeColor(118, 185, 0);
    expect(contrastColors('#76b900')).toBe('#131416');
  });

  it('returns dark text for bright yellow', () => {
    setProbeColor(255, 255, 0);
    expect(contrastColors('#ffff00')).toBe('#131416');
  });

  it('resolves CSS variables before probing', () => {
    setProbeColor(240, 240, 240);
    expect(contrastColors('var(--light-color)')).toBe('#131416');

    setProbeColor(26, 26, 26);
    expect(contrastColors('var(--dark-color)')).toBe('white');
  });

  it('uses canvas probe for any format (oklch, hsl, etc.)', () => {
    setProbeColor(200, 220, 100);
    expect(contrastColors('oklch(82% 0.19 140)')).toBe('#131416');
  });
});
