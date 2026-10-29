import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDismissed, markDismissed, markShown } from './persistence';

import {
  NUDGE_REGISTRY,
  TELEMETRY_TUTORIAL_STORAGE_KEY,
  TPUV7_LAUNCH_MODAL_STORAGE_KEY,
} from './registry';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
      'agentx-telemetry-tutorial',
      'eval-samples',
      'export',
      'filter-hint',
      'gradient-label',
      'huawei-ascend-950pr-ubenchx-banner',
      'reproducibility',
      'star-nudge',
      'tpuv7-agentx-launch-modal',
    ]);
  });

  it('renders the telemetry tutorial as an uncentered card on the agentic detail scope', () => {
    const tutorial = NUDGE_REGISTRY.find((n) => n.id === 'agentx-telemetry-tutorial');
    expect(tutorial?.scope).toBe('agentic-detail');
    expect(tutorial?.content.centered).toBeUndefined();
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

    const banner = NUDGE_REGISTRY.find(
      (nudge) => nudge.id === 'huawei-ascend-950pr-ubenchx-banner',
    );
    if (banner?.type !== 'banner') throw new Error('Missing launch banner');
    banner.content.onLinkClick?.();
    expect(location.href).toBe('/zh/ubenchx/core-memory-profiles');

    location.href = '';
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'tpuv7-agentx-launch-modal');
    if (modal?.type !== 'modal') throw new Error('Missing TPUv7 launch modal');
    modal.content.primaryAction?.onClick();
    expect(location.href).toBe(
      '/zh/inference/qwen-3-5?g_model=Qwen-3.5-397B-A17B&i_xmode=interactivity&i_seq=agentic-traces&i_prec=fp8',
    );
  });

  it.each(['', '/zh'])('offers both launch models in the %s route tree', (prefix) => {
    const location = { pathname: prefix || '/', href: '' };
    vi.stubGlobal('window', { location });
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'tpuv7-agentx-launch-modal');
    expect(modal?.content.title).toBe('TPUv7 prelimary results across multiple models');
    expect(modal?.content.titleZh).toBe('TPUv7 多模型初步结果');
    expect(modal?.content.description).toBe('AgentX Preview Submissions');
    expect(modal?.content.descriptionZh).toBe('AgentX 预览版提交结果');
    expect(modal?.content.primaryAction?.label).toBe('Qwen3.5');
    modal?.content.primaryAction?.onClick();
    expect(location.href).toBe(
      `${prefix}/inference/qwen-3-5?g_model=Qwen-3.5-397B-A17B&i_xmode=interactivity&i_seq=agentic-traces&i_prec=fp8`,
    );
    expect(modal?.content.secondaryAction?.label).toBe('Kimi K3');
    modal?.content.secondaryAction?.onClick();
    expect(location.href).toBe(`${prefix}/inference/kimi-k3`);
  });

  it('centers the TPUv7 launch modal on the landing page', () => {
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'tpuv7-agentx-launch-modal');
    expect(modal?.scope).toBe('landing');
    expect(modal?.content.centered).toBe(true);
    expect(modal?.storageKey).toBe(TPUV7_LAUNCH_MODAL_STORAGE_KEY);
    expect(TPUV7_LAUNCH_MODAL_STORAGE_KEY).toBe(
      'inferencex-tpuv7-agentx-multiple-model-modal-dismissed',
    );
    expect(modal?.dismissal).toEqual({ type: 'timed', durationMs: 3 * 24 * 60 * 60 * 1000 });
    expect(modal?.analytics).toEqual({
      shown: 'inference_tpuv7_agentx_modal_shown',
      dismissed: 'inference_tpuv7_agentx_modal_dismissed',
      action: 'inference_tpuv7_agentx_modal_clicked',
    });
  });

  it('ignores the old launch dismissal and waits exactly three days after each new dismissal', () => {
    const oldKey = 'inferencex-tpuv7-agentx-modal-dismissed';
    const storage = new Map<string, string>([[oldKey, '1']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    let now = Date.parse('2026-10-18T12:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const modal = NUDGE_REGISTRY.find((nudge) => nudge.id === 'tpuv7-agentx-launch-modal')!;
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
