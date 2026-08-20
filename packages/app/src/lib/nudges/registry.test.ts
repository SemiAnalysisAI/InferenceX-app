import { afterEach, describe, expect, it, vi } from 'vitest';

import { NUDGE_REGISTRY, TELEMETRY_TUTORIAL_STORAGE_KEY } from './registry';
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NUDGE_REGISTRY integrity', () => {
  it('has no duplicate IDs', () => {
    const ids = NUDGE_REGISTRY.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate storage keys', () => {
    const keys = NUDGE_REGISTRY.map((n) => n.storageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has a valid type', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(['toast', 'modal', 'banner']).toContain(nudge.type);
    }
  });

  it('every entry has a valid scope', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(['dashboard', 'landing', 'evaluation', 'agentic-detail']).toContain(nudge.scope);
    }
  });

  it('every entry has a non-empty title and description', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(nudge.content.title.length).toBeGreaterThan(0);
      expect(nudge.content.description.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a numeric priority', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(typeof nudge.priority).toBe('number');
    }
  });

  it('every entry has at least one trigger', () => {
    for (const nudge of NUDGE_REGISTRY) {
      const triggers = Array.isArray(nudge.trigger) ? nudge.trigger : [nudge.trigger];
      expect(triggers.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a valid dismissal type', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(['session', 'permanent', 'timed']).toContain(nudge.dismissal.type);
    }
  });

  it('timed dismissals have a positive durationMs', () => {
    for (const nudge of NUDGE_REGISTRY) {
      if (nudge.dismissal.type === 'timed') {
        expect(nudge.dismissal.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it('contains the expected set of migrated nudges', () => {
    const ids = NUDGE_REGISTRY.map((n) => n.id).toSorted();
    expect(ids).toEqual([
      'agentic-results-launch-banner',
      'agentic-results-launch-modal',
      'agentx-telemetry-tutorial',
      'eval-samples',
      'export',
      'feedback-modal',
      'filter-hint',
      'github-star-modal',
      'gradient-label',
      'reproducibility',
      'star-nudge',
    ]);
  });

  it('renders the agentic launch modal centered, with the dismissed key e2e suppresses', () => {
    const launch = NUDGE_REGISTRY.find((n) => n.id === 'agentic-results-launch-modal');
    expect(launch?.content.centered).toBe(true);
    // cypress/support/e2e.ts seeds this key so the backdrop can't cover the
    // UI under test; a rename here has to be mirrored there.
    expect(launch?.storageKey).toBe('inferencex-agentic-results-modal-dismissed');
  });

  it('renders the telemetry tutorial as an uncentered card on the agentic detail scope', () => {
    const tutorial = NUDGE_REGISTRY.find((n) => n.id === 'agentx-telemetry-tutorial');
    expect(tutorial?.scope).toBe('agentic-detail');
    // A backdrop would cover the very charts the tutorial describes.
    expect(tutorial?.content.centered).toBeUndefined();
    // cypress/support/e2e.ts seeds this key so the card can't sit over the
    // charts under test; a rename here has to be mirrored there.
    expect(tutorial?.storageKey).toBe(TELEMETRY_TUTORIAL_STORAGE_KEY);
    expect(TELEMETRY_TUTORIAL_STORAGE_KEY).toBe('inferencex-agentx-telemetry-tutorial-dismissed');
  });

  it('keeps internal action destinations in the active Chinese route tree', () => {
    const location = { pathname: '/zh/inference', href: '' };
    vi.stubGlobal('window', { location });

    const reproducibility = NUDGE_REGISTRY.find((nudge) => nudge.id === 'reproducibility');
    if (reproducibility?.type !== 'toast') throw new Error('Missing reproducibility toast');
    reproducibility.content.action?.onClick();
    expect(location.href).toBe('/zh/about#reproducibility');

    const launch = NUDGE_REGISTRY.find((nudge) => nudge.id === 'agentic-results-launch-modal');
    if (launch?.type !== 'modal') throw new Error('Missing launch modal');
    launch.content.primaryAction?.onClick();
    expect(location.href).toBe('/zh/inference?i_seq=agentic-traces');
  });

  it('preserves testId for every entry', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(nudge.content.testId).toBeTruthy();
    }
  });

  it('only server-renders deterministic immediate banners', () => {
    const initialNudges = NUDGE_REGISTRY.filter((nudge) => nudge.renderOnInitialLoad);

    expect(initialNudges).toHaveLength(1);
    for (const nudge of initialNudges) {
      const triggers = Array.isArray(nudge.trigger) ? nudge.trigger : [nudge.trigger];
      expect(nudge.type).toBe('banner');
      expect(triggers.some((trigger) => trigger.type === 'immediate')).toBe(true);
      expect(nudge.conditions).toBeUndefined();
      expect(nudge.permanentSuppressKey).toBeUndefined();
      expect(nudge.schedule).toBeUndefined();
    }
  });
});
