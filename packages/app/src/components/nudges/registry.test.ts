import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NUDGE_REGISTRY, userHasStarredRepo } from './registry';

const ALL_IDS = NUDGE_REGISTRY.map((e) => e.id);

describe('NUDGE_REGISTRY shape', () => {
  it('has unique ids', () => {
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
  });

  it('only uses supported kinds', () => {
    for (const entry of NUDGE_REGISTRY) {
      expect(['toast', 'modal', 'banner']).toContain(entry.kind);
    }
  });

  it('has every previously-existing engagement nudge migrated', () => {
    // Sanity: the issue requires "no parallel systems left" — these are the
    // ids the framework now owns. If this list shrinks unintentionally, the
    // test fails so the regression is caught.
    const expected = [
      'launch-banner-dsv4',
      'dsv4-launch-modal',
      'github-star-modal',
      'reproducibility-nudge',
      'star-nudge',
      'export-nudge',
      'gradient-label-nudge',
      'eval-samples-nudge',
    ];
    expect(ALL_IDS.toSorted()).toEqual(expected.toSorted());
  });

  it('renders a non-empty title and description for each entry', () => {
    for (const entry of NUDGE_REGISTRY) {
      const ctx = { id: entry.id, triggerDetail: undefined, dismiss: () => {} };
      const content = entry.render(ctx);
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.description.length).toBeGreaterThan(0);
    }
  });

  it('every banner has a primary action with an href (the banner itself is the click target)', () => {
    for (const entry of NUDGE_REGISTRY.filter((e) => e.kind === 'banner')) {
      const ctx = { id: entry.id, triggerDetail: undefined, dismiss: () => {} };
      const content = entry.render(ctx);
      expect(content.primaryAction).toBeDefined();
      expect(content.primaryAction?.href).toBeTruthy();
    }
  });
});

describe('Migrated nudge triggers match original behavior', () => {
  it('reproducibility-nudge fires after a 1.5s mount delay (session)', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'reproducibility-nudge')!;
    expect(entry.trigger).toEqual({ kind: 'mount-delay', delayMs: 1500 });
    expect(entry.persistence).toEqual({ kind: 'session' });
  });

  it('eval-samples-nudge is gated to /evaluation with weekly cooldown', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'eval-samples-nudge')!;
    expect(entry.trigger).toEqual({ kind: 'mount-delay', delayMs: 1500 });
    expect(entry.persistence).toEqual({ kind: 'cooldown', durationMs: 7 * 24 * 60 * 60 * 1000 });
    expect(entry.routes?.some((r) => r.test('/evaluation'))).toBe(true);
    expect(entry.routes?.some((r) => r.test('/inference'))).toBe(false);
    expect(entry.externalDismissEvents).toContain('inferencex:eval-samples-opened');
  });

  it('export-nudge fires after the 2nd copy from a chart tooltip', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'export-nudge')!;
    expect(entry.trigger.kind).toBe('event');
    if (entry.trigger.kind !== 'event') throw new Error('unreachable');
    const copy = entry.trigger.events[0];
    expect(copy.name).toBe('copy');
    expect(copy.target).toBe('document');
    expect(copy.threshold).toBe(2);
    expect(copy.selector).toBe('[data-chart-tooltip]');
  });

  it('star-nudge listens to tab-change (×2) and action (×1) with 1.5s debounce', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'star-nudge')!;
    expect(entry.trigger.kind).toBe('event');
    if (entry.trigger.kind !== 'event') throw new Error('unreachable');
    expect(entry.trigger.afterDelayMs).toBe(1500);
    const tabChange = entry.trigger.events.find((e) => e.name === 'inferencex:tab-change');
    const action = entry.trigger.events.find((e) => e.name === 'inferencex:action');
    expect(tabChange?.threshold).toBe(2);
    expect(action?.threshold ?? 1).toBe(1);
    expect(entry.externalDismissEvents).toContain('inferencex:starred');
  });

  it('gradient-label-nudge captures `enableGradient` from the trigger detail', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'gradient-label-nudge')!;
    const enable = vi.fn();
    const content = entry.render({
      id: entry.id,
      triggerDetail: { enableGradient: enable },
      dismiss: () => {},
    });
    content.primaryAction?.onClick?.({ id: entry.id, triggerDetail: undefined, dismiss: () => {} });
    expect(enable).toHaveBeenCalled();
  });

  it('github-star-modal yields to the dsv4-launch-modal until that one is dismissed', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'github-star-modal')!;
    const dsv4 = NUDGE_REGISTRY.find((e) => e.id === 'dsv4-launch-modal')!;
    expect(entry.priority ?? 0).toBeLessThan(dsv4.priority ?? 0);
    expect(entry.condition).toBeDefined();
  });

  it('launch-banner uses forever persistence (one-shot announcement)', () => {
    const entry = NUDGE_REGISTRY.find((e) => e.id === 'launch-banner-dsv4')!;
    expect(entry.kind).toBe('banner');
    expect(entry.persistence).toEqual({ kind: 'forever' });
  });
});

describe('userHasStarredRepo', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false when the starred flag is absent', () => {
    expect(userHasStarredRepo()).toBe(false);
  });

  it('returns true when the starred flag is set', () => {
    store.set('inferencex-starred', '1');
    expect(userHasStarredRepo()).toBe(true);
  });

  it('returns false when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(userHasStarredRepo()).toBe(false);
  });
});
