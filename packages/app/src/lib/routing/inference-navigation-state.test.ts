import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getInferenceNavigationModel,
  setInferenceNavigationModel,
  subscribeInferenceNavigationModel,
} from './inference-navigation-state';

let unsubscribe: (() => void) | undefined;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  setInferenceNavigationModel(undefined);
});

describe('inference navigation selection', () => {
  it('starts without a model and retains explicit legacy selections', () => {
    expect(getInferenceNavigationModel()).toBeUndefined();
    setInferenceNavigationModel('DeepSeek-V4-Pro');
    expect(getInferenceNavigationModel()).toBe('DeepSeek-V4-Pro');
  });

  it('notifies subscribers only when the selected model changes', () => {
    const listener = vi.fn();
    unsubscribe = subscribeInferenceNavigationModel(listener);
    setInferenceNavigationModel('Kimi-K3');
    setInferenceNavigationModel('Kimi-K3');
    setInferenceNavigationModel('DeepSeek-V4-Pro');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getInferenceNavigationModel()).toBe('DeepSeek-V4-Pro');
  });

  it('unsubscribes without discarding the selection', () => {
    const listener = vi.fn();
    unsubscribe = subscribeInferenceNavigationModel(listener);
    setInferenceNavigationModel('Kimi-K3');
    unsubscribe();
    setInferenceNavigationModel('DeepSeek-V4-Pro');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getInferenceNavigationModel()).toBe('DeepSeek-V4-Pro');
  });
});
