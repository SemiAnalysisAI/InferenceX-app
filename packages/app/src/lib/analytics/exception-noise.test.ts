import { describe, expect, it } from 'bun:test';
import type { CaptureResult } from 'posthog-js';

import { dropNoiseExceptions } from './exception-noise';

const exception = (...values: string[]) =>
  ({
    uuid: 'u',
    event: '$exception',
    properties: { $exception_list: values.map((value) => ({ type: 'Error', value })) },
  }) as CaptureResult;

const ORIGIN = 'https://inferencex.semianalysis.com';

const framed = (type: string, value: string, filenames: string[]) =>
  ({
    uuid: 'u',
    event: '$exception',
    properties: {
      $current_url: `${ORIGIN}/model/kimi-k3`,
      $exception_list: [
        { type, value, stacktrace: { frames: filenames.map((filename) => ({ filename })) } },
      ],
    },
  }) as CaptureResult;

const STACK_OVERFLOW = 'Maximum call stack size exceeded.';

describe('dropNoiseExceptions', () => {
  it('drops the known noise signatures seen in production', () => {
    for (const value of [
      'ResizeObserver loop completed with undelivered notifications.',
      'Non-Error promise rejection captured with value: Object Not Found Matching Id:3, MethodName:update, ParamCount:4',
      'AbortError: Skipping view transition because skipTransition() was called.',
      'AbortError: Transition was skipped. Navigation aborted',
      'InvalidStateError: Transition was aborted because of invalid state. Document hidden',
      'Script error.',
      "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
      'PostHog request timed out after 3000ms',
      "Can't find variable: EmptyRanges",
    ]) {
      expect(dropNoiseExceptions(exception(value))).toBeNull();
    }
  });

  it('drops exceptions whose frames are all in Safari-masked extension scripts', () => {
    const masked = framed('TypeError', "undefined is not an object (evaluating 'e.useCache')", [
      'webkit-masked-url://hidden/',
      'webkit-masked-url://hidden/',
    ]);
    expect(dropNoiseExceptions(masked)).toBeNull();
    const partly = framed('TypeError', 'x', [
      'webkit-masked-url://hidden/',
      `${ORIGIN}/_next/a.js`,
    ]);
    expect(dropNoiseExceptions(partly)).toBe(partly);
  });

  it('drops stack overflows only when every frame is in the page document', () => {
    const injected = framed('RangeError', STACK_OVERFLOW, [
      `${ORIGIN}/infx/inference/kimi-k3`,
      `${ORIGIN}/`,
    ]);
    expect(dropNoiseExceptions(injected)).toBeNull();
    const ours = framed('RangeError', STACK_OVERFLOW, [
      `${ORIGIN}/model/kimi-k3`,
      `${ORIGIN}/_next/static/chunks/app.js`,
    ]);
    expect(dropNoiseExceptions(ours)).toBe(ours);
    const noFrames = framed('RangeError', STACK_OVERFLOW, []);
    expect(dropNoiseExceptions(noFrames)).toBe(noFrames);
    const otherError = framed('TypeError', 'x', [`${ORIGIN}/model/kimi-k3`]);
    expect(dropNoiseExceptions(otherError)).toBe(otherError);
  });

  it('keeps real errors, mixed lists, and non-exception events', () => {
    const real = exception("Cannot read properties of undefined (reading 'className')");
    expect(dropNoiseExceptions(real)).toBe(real);
    const mixed = exception('Script error.', 'Failed to fetch');
    expect(dropNoiseExceptions(mixed)).toBe(mixed);
    const pageview = { uuid: 'u', event: '$pageview', properties: {} } as CaptureResult;
    expect(dropNoiseExceptions(pageview)).toBe(pageview);
  });
});
