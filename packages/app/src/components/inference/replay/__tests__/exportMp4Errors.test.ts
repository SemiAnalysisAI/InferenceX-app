import { describe, expect, it } from 'vitest';

import { Mp4ExportError, isMp4ExportError } from '../exportMp4';

describe('Mp4ExportError', () => {
  it('sets name to "Mp4ExportError" so brand checks survive minification', () => {
    const e = new Mp4ExportError('boom', {
      stage: 'encode',
      encoderState: 'unknown',
      queuedFrames: 0,
    });
    expect(e.name).toBe('Mp4ExportError');
  });

  it('round-trips stage, encoderState, and queuedFrames', () => {
    const e = new Mp4ExportError('boom', {
      stage: 'flush',
      encoderState: 'closed',
      queuedFrames: 4,
    });
    expect(e.stage).toBe('flush');
    expect(e.encoderState).toBe('closed');
    expect(e.queuedFrames).toBe(4);
  });

  it('preserves cause when supplied', () => {
    const underlying = new TypeError('out of memory');
    const e = new Mp4ExportError('boom', {
      stage: 'render',
      encoderState: 'configured',
      queuedFrames: 2,
      cause: underlying,
    });
    expect((e as { cause?: unknown }).cause).toBe(underlying);
  });

  it('inherits Error.message via super(message)', () => {
    const e = new Mp4ExportError('boom', {
      stage: 'mux',
      encoderState: 'unknown',
      queuedFrames: 0,
    });
    expect(e.message).toBe('boom');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('isMp4ExportError', () => {
  it('returns true for Mp4ExportError instances', () => {
    const e = new Mp4ExportError('boom', {
      stage: 'init',
      encoderState: 'unknown',
      queuedFrames: 0,
    });
    expect(isMp4ExportError(e)).toBe(true);
  });

  it('returns true for plain objects with the right name brand (dynamic-import realm safety)', () => {
    const sentinel = { name: 'Mp4ExportError', message: 'x', stage: 'encode' };
    expect(isMp4ExportError(sentinel)).toBe(true);
  });

  it('returns false for regular Errors', () => {
    expect(isMp4ExportError(new Error('boom'))).toBe(false);
    expect(isMp4ExportError(new TypeError('boom'))).toBe(false);
  });

  it('returns false for nullish or non-object inputs', () => {
    expect(isMp4ExportError(null)).toBe(false);
    expect(isMp4ExportError(undefined)).toBe(false);
    expect(isMp4ExportError('Mp4ExportError')).toBe(false);
    expect(isMp4ExportError(42)).toBe(false);
  });
});
