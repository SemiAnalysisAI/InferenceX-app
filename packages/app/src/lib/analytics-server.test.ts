import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { captureServer, trackServer } from './analytics-server';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com/');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('preserves the existing non-awaiting server API and aggregate identity', () => {
  const send = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', send);
  expect(trackServer('feedback_submission_failed', { reason: 'example' })).toBeUndefined();
  expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({ distinct_id: 'server' });
  expect(send.mock.calls[0][0]).toBe('https://us.i.posthog.com/capture/');
});

it('handles missing configuration without sending', async () => {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  await expect(captureServer('test_event')).resolves.toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

it.each(['reject', 'non-2xx', 'serialize'])(
  'isolates %s failure without retries or sensitive logs',
  async (kind) => {
    const send = vi
      .fn()
      .mockImplementation(() =>
        kind === 'reject'
          ? Promise.reject(new Error('secret URL'))
          : Promise.resolve(new Response('secret body', { status: 503 })),
      );
    vi.stubGlobal('fetch', send);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      captureServer('test_event', kind === 'serialize' ? circular : {}),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(kind === 'serialize' ? 0 : 1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret');
  },
);

it('bounds the one network attempt by a three-second abort signal', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const send = vi.fn().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
      }),
  );
  vi.stubGlobal('fetch', send);
  const pending = captureServer('test_event');
  expect(timeout).toHaveBeenCalledWith(3_000);
  controller.abort(new DOMException('timeout', 'TimeoutError'));
  await expect(pending).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledTimes(1);
});
