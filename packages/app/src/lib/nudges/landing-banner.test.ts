import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assignedLandingBannerVariant,
  LANDING_BANNER_DISMISSED_ATTRIBUTE,
  LANDING_BANNER_STORAGE_KEY,
  LANDING_BANNER_VARIANT_ATTRIBUTE,
  LANDING_BANNER_VARIANT_STORAGE_KEY,
  landingBannerPrepaintScript,
  landingBannerPrepaintStyle,
} from './landing-banner';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runPrepaint({
  stored = {},
  random = 0,
  storageThrows = false,
}: {
  stored?: Record<string, string>;
  random?: number;
  storageThrows?: boolean;
}) {
  const storage = new Map(Object.entries(stored));
  const attributes = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('blocked');
      return storage.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (storageThrows) throw new Error('blocked');
      storage.set(key, value);
    },
  };
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
  };
  const math = Object.create(Math) as Math;
  math.random = () => random;
  runInNewContext(landingBannerPrepaintScript(), { localStorage, document, Math: math });
  return { storage, attributes };
}

describe('landing banner pre-paint script', () => {
  it.each([
    [0.1, 'ubenchx'],
    [0.9, 'operatorx'],
  ])('assigns and stores an arm on first visit (random %s → %s)', (random, arm) => {
    const { storage, attributes } = runPrepaint({ random });
    expect(attributes.get(LANDING_BANNER_VARIANT_ATTRIBUTE)).toBe(arm);
    expect(storage.get(LANDING_BANNER_VARIANT_STORAGE_KEY)).toBe(arm);
  });

  it('keeps a stored arm regardless of the random draw', () => {
    const { attributes } = runPrepaint({
      stored: { [LANDING_BANNER_VARIANT_STORAGE_KEY]: 'operatorx' },
      random: 0,
    });
    expect(attributes.get(LANDING_BANNER_VARIANT_ATTRIBUTE)).toBe('operatorx');
  });

  it('reassigns an unknown stored arm', () => {
    const { storage, attributes } = runPrepaint({
      stored: { [LANDING_BANNER_VARIANT_STORAGE_KEY]: 'retired-arm' },
      random: 0.9,
    });
    expect(attributes.get(LANDING_BANNER_VARIANT_ATTRIBUTE)).toBe('operatorx');
    expect(storage.get(LANDING_BANNER_VARIANT_STORAGE_KEY)).toBe('operatorx');
  });

  it('still assigns an arm when storage is blocked', () => {
    const { attributes } = runPrepaint({ storageThrows: true, random: 0.1 });
    expect(attributes.get(LANDING_BANNER_VARIANT_ATTRIBUTE)).toBe('ubenchx');
    expect(attributes.has(LANDING_BANNER_DISMISSED_ATTRIBUTE)).toBe(false);
  });

  it('marks a dismissed banner for either arm', () => {
    const { attributes } = runPrepaint({
      stored: {
        [LANDING_BANNER_STORAGE_KEY]: '1',
        [LANDING_BANNER_VARIANT_STORAGE_KEY]: 'operatorx',
      },
    });
    expect(attributes.has(LANDING_BANNER_DISMISSED_ATTRIBUTE)).toBe(true);
    expect(attributes.get(LANDING_BANNER_VARIANT_ATTRIBUTE)).toBe('operatorx');
  });

  it('splits close to 50/50 over many visitors', () => {
    let operatorx = 0;
    for (let i = 0; i < 1000; i += 1) {
      const { attributes } = runPrepaint({ random: i / 1000 });
      if (attributes.get(LANDING_BANNER_VARIANT_ATTRIBUTE) === 'operatorx') operatorx += 1;
    }
    expect(operatorx).toBe(500);
  });
});

describe('landing banner pre-paint style', () => {
  it('hides only the arms the visitor was not assigned', () => {
    const style = landingBannerPrepaintStyle();
    expect(style).toContain(
      `html[${LANDING_BANNER_VARIANT_ATTRIBUTE}="ubenchx"] [data-banner-variant="operatorx"]`,
    );
    expect(style).toContain(
      `html[${LANDING_BANNER_VARIANT_ATTRIBUTE}="operatorx"] [data-banner-variant="ubenchx"]`,
    );
    expect(style).not.toContain('[data-banner-variant="ubenchx"] [data-banner-variant="ubenchx"]');
    expect(style).toContain(`html[${LANDING_BANNER_DISMISSED_ATTRIBUTE}] [data-initial-banner]`);
  });
});

describe('assignedLandingBannerVariant', () => {
  it('reads the arm from the document and ignores unknown values', () => {
    let value: string | null = 'operatorx';
    vi.stubGlobal('document', { documentElement: { getAttribute: () => value } });
    expect(assignedLandingBannerVariant()).toBe('operatorx');
    value = 'other';
    expect(assignedLandingBannerVariant()).toBeNull();
    value = null;
    expect(assignedLandingBannerVariant()).toBeNull();
  });
});
