import { describe, expect, it } from 'vitest';

import { NUDGE_REGISTRY } from './registry';

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
      expect(['dashboard', 'landing', 'evaluation']).toContain(nudge.scope);
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
      'eval-samples',
      'export',
      'feedback-modal',
      'filter-hint',
      'github-star-modal',
      'gradient-label',
      'minimax-m3-launch-banner',
      'minimax-m3-launch-modal',
      'reproducibility',
      'star-nudge',
    ]);
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
