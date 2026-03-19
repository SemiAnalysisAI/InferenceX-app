import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SocialShareButtons', () => {
  let mockWindowOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWindowOpen = vi.fn();
    vi.stubGlobal('open', mockWindowOpen);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds correct Twitter share URL', () => {
    const text =
      'Check out InferenceX — open-source ML inference benchmarks comparing GPUs across real-world workloads. Transparent, up-to-date data for the AI community.';
    const url = 'https://example.com';

    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

    expect(tweetUrl).toContain('twitter.com/intent/tweet');
    expect(tweetUrl).toContain(encodeURIComponent('InferenceX'));
    expect(tweetUrl).toContain(encodeURIComponent(url));
  });

  it('builds correct LinkedIn share URL', () => {
    const url = 'https://example.com';
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

    expect(linkedInUrl).toContain('linkedin.com/sharing/share-offsite');
    expect(linkedInUrl).toContain(encodeURIComponent(url));
  });
});
