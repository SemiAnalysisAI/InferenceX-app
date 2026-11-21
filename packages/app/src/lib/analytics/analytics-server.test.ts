import { afterEach, beforeEach, expect, it, vi } from 'bun:test';
import { mocked, stubEnv, stubGlobal, unstubAllEnvs, unstubAllGlobals } from '@/test/helpers';

import { captureServer, trackServer } from './analytics-server';

beforeEach(() => {
  stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key');
  stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com/');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  unstubAllGlobals();
  unstubAllEnvs();
});

it('preserves the existing non-awaiting server API and aggregate identity', () => {
  const send = vi.fn().mockResolvedValue(new Response('{}'));
  stubGlobal('fetch', send);
  trackServer('feedback_submission_failed', { reason: 'example' });
  expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({
    distinct_id: 'server',
    properties: { reason: 'example', $lib: 'inferencex-server', $process_person_profile: false },
  });
  expect(send.mock.calls[0][0]).toBe('https://us.i.posthog.com/capture/');
});

it('handles missing configuration without sending', async () => {
  stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
  const send = vi.fn();
  stubGlobal('fetch', send);
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
    stubGlobal('fetch', send);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      captureServer('test_event', kind === 'serialize' ? circular : {}),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(kind === 'serialize' ? 0 : 1);
    expect(JSON.stringify(mocked(console.error).mock.calls)).not.toContain('secret');
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
  stubGlobal('fetch', send);
  const pending = captureServer('test_event');
  expect(timeout).toHaveBeenCalledWith(3_000);
  controller.abort(new DOMException('timeout', 'TimeoutError'));
  await expect(pending).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledTimes(1);
});
