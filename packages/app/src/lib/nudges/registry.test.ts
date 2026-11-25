import { afterEach, describe, expect, it, vi } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';
import { NUDGE_SLOTS } from './inline-slot';
import { isDismissed, markDismissed, markShown } from './persistence';

import {
  NUDGE_REGISTRY,
  TELEMETRY_TUTORIAL_STORAGE_KEY,
  LAUNCH_MODAL_STORAGE_KEY,
} from './registry';
afterEach(() => {
  unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NUDGE_REGISTRY integrity', () => {
  it('has no duplicate IDs', () => {
    const ids = NUDGE_REGISTRY.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate storage keys outside A/B arms of one nudge', () => {
    const keys = NUDGE_REGISTRY.filter((n) => n.variant !== 'operatorx').map((n) => n.storageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has a valid type', () => {
    for (const nudge of NUDGE_REGISTRY) {
      expect(['toast', 'modal', 'banner', 'coach-mark', 'inline']).toContain(nudge.type);
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
      'agentx-telemetry-tutorial',
      'eval-samples',
      'export',
      'filter-hint',
      'gradient-label',
      'reproducibility',
      'star-nudge',
      'trainium3-agentx-launch-modal',
      'trainium3-glm-5-2-banner',
      'trainium3-glm-5-2-banner-b',
    ]);
  });

  it('renders the telemetry tutorial as an uncentered card on the agentic detail scope', () => {
    const tutorial = NUDGE_REGISTRY.find((n) => n.id === 'agentx-telemetry-tutorial');
    expect(tutorial?.scope).toBe('agentic-detail');
    expect(tutorial?.content.centered).toBeUndefined();
    expect(tutorial?.storageKey).toBe(TELEMETRY_TUTORIAL_STORAGE_KEY);
    expect(TELEMETRY_TUTORIAL_STORAGE_KEY).toBe('inferencex-agentx-telemetry-tutorial-dismissed');
    // A timer let the card paint before any input, making it the page's late LCP element.
    expect(tutorial?.trigger).toMatchObject({ type: 'dom-event', event: 'scroll' });
  });

  it('keeps internal action destinations in the active Chinese route tree', () => {
    const location = { pathname: '/zh/infx/inference', href: '' };
    stubGlobal('window', { location });

    const reproducibility = NUDGE_REGISTRY.find((nudge) => nudge.id === 'reproducibility');
    if (reproducibility?.type !== 'toast') throw new Error('Missing reproducibility toast');
    reproducibility.content.action?.onClick();
    expect(location.href).toBe('/zh/about#reproducibility');

    for (const id of ['trainium3-glm-5-2-banner', 'trainium3-glm-5-2-banner-b']) {
      location.href = '';
      const banner = NUDGE_REGISTRY.find((nudge) => nudge.id === id);
      if (banner?.type !== 'banner') throw new Error(`Missing launch banner ${id}`);
      banner.content.onLinkClick?.();
      expect(location.href).toBe('/zh/infx/inference/glm-5-3?i_vendor=AWS');
    }

    location.href = '';
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'trainium3-agentx-launch-modal');
    if (modal?.type !== 'modal') throw new Error('Missing Trainium3 launch modal');
    modal.content.primaryAction?.onClick();
    expect(location.href).toBe('/zh/infx/inference/glm-5-3?i_vendor=AWS');
  });

  it('shows the Trainium3 banner on both A/B arms', () => {
    const arms = NUDGE_REGISTRY.filter((nudge) => nudge.variant);
    expect(arms.map((arm) => [arm.variant, arm.content.href])).toEqual([
      ['ubenchx', '/infx/inference/glm-5-3?i_vendor=AWS'],
      ['operatorx', '/infx/inference/glm-5-3?i_vendor=AWS'],
    ]);
    for (const arm of arms) {
      expect(arm.content.title).toBe('Amazon Trainium3 Results');
      expect(arm.content.titleZh).toBe('Amazon Trainium3 结果');
      expect(arm.content.description).toBe('GLM 5.2 AgentX Preview Results');
      expect(arm.content.descriptionZh).toBe('GLM 5.2 AgentX 预览结果');
    }
    for (const arm of arms) {
      expect(arm).toMatchObject({
        type: 'banner',
        scope: 'landing',
        renderOnInitialLoad: true,
        priority: arms[0].priority,
        storageKey: arms[0].storageKey,
        analytics: {
          shown: 'landing_banner_shown',
          dismissed: 'landing_banner_dismissed',
          action: 'landing_banner_clicked',
          properties: { experiment: 'landing_banner_destination', variant: arm.variant },
        },
      });
    }
  });

  it.each(['', '/zh'])('opens Trainium3 GLM 5.2 results in the %s route tree', (prefix) => {
    const location = { pathname: prefix || '/', href: '' };
    stubGlobal('window', { location });
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'trainium3-agentx-launch-modal');
    expect(modal?.content.title).toBe('Amazon Trainium3 Preliminary Results');
    expect(modal?.content.titleZh).toBe('Amazon Trainium3 初步结果');
    expect(modal?.content.description).toBe('GLM 5.2 AgentX Preview Submission');
    expect(modal?.content.descriptionZh).toBe('GLM 5.2 AgentX 预览版提交结果');
    expect(modal?.content.primaryAction?.label).toBe('GLM 5.2');
    expect(modal?.content.secondaryAction).toBeUndefined();
    expect(modal?.content.additionalActions).toBeUndefined();
    modal?.content.primaryAction?.onClick();
    expect(location.href).toBe(`${prefix}/infx/inference/glm-5-3?i_vendor=AWS`);
  });

  it('centers the Trainium3 launch modal on the landing page', () => {
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'trainium3-agentx-launch-modal');
    expect(modal?.scope).toBe('landing');
    expect(modal?.content.centered).toBe(true);
    expect(modal?.storageKey).toBe(LAUNCH_MODAL_STORAGE_KEY);
    expect(LAUNCH_MODAL_STORAGE_KEY).toBe('inferencex-trainium3-agentx-modal-dismissed');
    expect(modal?.dismissal).toEqual({ type: 'timed', durationMs: 3 * 24 * 60 * 60 * 1000 });
    expect(modal?.analytics).toEqual({
      shown: 'inference_trainium3_agentx_modal_shown',
      dismissed: 'inference_trainium3_agentx_modal_dismissed',
      action: 'inference_trainium3_agentx_modal_clicked',
    });
  });

  it('ignores the old launch dismissal and waits exactly three days after each new dismissal', () => {
    const oldKey = 'inferencex-tpuv7-agentx-multiple-model-modal-dismissed';
    const storage = new Map<string, string>([[oldKey, '1']]);
    stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    let now = Date.parse('2026-10-18T12:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'trainium3-agentx-launch-modal')!;
    expect(isDismissed(modal.storageKey, modal.dismissal)).toBe(false);
    markShown(modal.storageKey, modal.dismissal);
    expect(storage.has(modal.storageKey)).toBe(false);
    markDismissed(modal.storageKey, modal.dismissal);
    expect(storage.get(modal.storageKey)).toBe(String(now));
    now += 3 * 24 * 60 * 60 * 1000 - 1;
    expect(isDismissed(modal.storageKey, modal.dismissal)).toBe(true);
    now += 1;
    expect(isDismissed(modal.storageKey, modal.dismissal)).toBe(false);
    markShown(modal.storageKey, modal.dismissal);
    expect(isDismissed(modal.storageKey, modal.dismissal)).toBe(false);
    markDismissed(modal.storageKey, modal.dismissal);
    expect(isDismissed(modal.storageKey, modal.dismissal)).toBe(true);
    expect(storage.get(modal.storageKey)).toBe(String(now));
    expect(storage.get(oldKey)).toBe('1');
  });

  it('gives every coach mark an anchor to point at', () => {
    for (const nudge of NUDGE_REGISTRY.filter((n) => n.type === 'coach-mark')) {
      expect(typeof nudge.content.anchor?.resolve).toBe('function');
    }
  });

  it('renders chart guidance inline in its chart card instead of as a floating toast', () => {
    const slots = Object.fromEntries(
      NUDGE_REGISTRY.filter((n) => n.type === 'inline').map((n) => [n.id, n.content.slot]),
    );
    expect(slots).toEqual({
      'gradient-label': NUDGE_SLOTS.inferenceLegend,
      'filter-hint': NUDGE_SLOTS.inferenceLegend,
      'eval-samples': NUDGE_SLOTS.evaluationTable,
    });
  });

  it('does not register the retired agentic point callout', () => {
    expect(
      NUDGE_REGISTRY.some(
        (nudge) =>
          nudge.id === 'agentic-point-detail' ||
          nudge.content.testId === 'agentic-point-coach-mark' ||
          nudge.storageKey === 'inferencex-agentic-point-coach-mark-dismissed',
      ),
    ).toBe(false);
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

    // Several server-rendered banners are allowed only as A/B arms, one per arm.
    if (initialNudges.length > 1) {
      const arms = initialNudges.map((nudge) => nudge.variant);
      expect(arms.every(Boolean)).toBe(true);
      expect(new Set(arms).size).toBe(arms.length);
    }
    expect(initialNudges.length).toBeGreaterThan(0);
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
