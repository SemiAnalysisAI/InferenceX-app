import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AGENTIC_COACH_MARK_STORAGE_KEY,
  AGENTIC_POINT_ACTION_SELECTOR,
} from './agentic-point-coach-mark';
import { dismissesOnAction } from './policy';
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
      expect(['toast', 'modal', 'banner', 'coach-mark']).toContain(nudge.type);
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
      'agentic-point-detail',
      'agentx-telemetry-tutorial',
      'eval-samples',
      'export',
      'feedback-modal',
      'filter-hint',
      'gradient-label',
      'openai-rubin-comparison-banner',
      'reproducibility',
      'star-nudge',
    ]);
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

    const banner = NUDGE_REGISTRY.find((nudge) => nudge.id === 'openai-rubin-comparison-banner');
    if (banner?.type !== 'banner') throw new Error('Missing launch banner');
    expect(banner.storageKey).toBe('inferencex-openai-rubin-banner-dismissed');
    expect(banner.content.href).toBe(
      '/inference?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerMw',
    );
    expect(banner.analytics).toEqual({
      shown: 'inference_rubin_comparison_banner_shown',
      dismissed: 'inference_rubin_comparison_banner_dismissed',
      action: 'inference_rubin_comparison_banner_clicked',
      properties: {
        banner_id: 'openai-rubin-comparison',
        scenario: '8k/1k',
        model: 'DeepSeek-R1-0528',
        metric: 'y_outputTputPerMw',
      },
    });
    banner.content.onLinkClick?.();
    expect(location.href).toBe(
      '/zh/inference?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerMw',
    );
  });

  it('gives every coach mark an anchor to point at', () => {
    for (const nudge of NUDGE_REGISTRY.filter((n) => n.type === 'coach-mark')) {
      expect(typeof nudge.content.anchor?.resolve).toBe('function');
    }
  });

  it('anchors the agentic coach mark to the inference chart, dismissed for good on a point click', () => {
    const coachMark = NUDGE_REGISTRY.find((n) => n.id === 'agentic-point-detail');

    expect(coachMark?.type).toBe('coach-mark');
    expect(coachMark?.scope).toBe('dashboard');
    expect(coachMark?.dismissal.type).toBe('permanent');
    expect(coachMark?.storageKey).toBe(AGENTIC_COACH_MARK_STORAGE_KEY);
    expect(dismissesOnAction(coachMark!)).toBe(true);
    expect(coachMark?.content.anchor?.actionSelector).toBe(AGENTIC_POINT_ACTION_SELECTOR);
    expect(typeof coachMark?.content.anchor?.getRect).toBe('function');
    expect(typeof coachMark?.content.anchor?.getMutationRoot).toBe('function');
    expect(AGENTIC_COACH_MARK_STORAGE_KEY).toBe('inferencex-agentic-point-coach-mark-dismissed');
  });

  it('ships a Chinese translation for every user-visible nudge string', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(nudge.content.titleZh, `${nudge.id} title`).toBeTruthy();
      expect(nudge.content.descriptionZh, `${nudge.id} description`).toBeTruthy();
    }
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
