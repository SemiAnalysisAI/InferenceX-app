import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captureMock = vi.fn();

vi.mock('posthog-js', () => ({
  default: { capture: captureMock },
}));

import { track } from './analytics';

describe('track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends event to PostHog with properties', async () => {
    track('test_event', { key: 'value' });
    await vi.dynamicImportSettled();
    expect(captureMock).toHaveBeenCalledWith('test_event', { key: 'value' });
  });

  it('sends event without properties', async () => {
    track('test_event');
    await vi.dynamicImportSettled();
    expect(captureMock).toHaveBeenCalledWith('test_event', undefined);
  });

  it('does not call capture when window is undefined', async () => {
    vi.unstubAllGlobals();
    track('test_event');
    await vi.dynamicImportSettled();
    expect(captureMock).not.toHaveBeenCalled();
  });
});
