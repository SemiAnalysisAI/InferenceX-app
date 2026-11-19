import { describe, expect, it, vi } from 'vitest';

import { isTransientDbError, withTransientDbRetry } from './db-retry';

const codeError = (code: string, message = code) => Object.assign(new Error(message), { code });

describe('isTransientDbError', () => {
  it('recognizes dropped connections and auth timeouts', () => {
    expect(isTransientDbError(codeError('CONNECTION_CLOSED'))).toBe(true);
    expect(isTransientDbError(codeError('57P01'))).toBe(true);
    expect(isTransientDbError(new Error('Authentication timed out'))).toBe(true);
    expect(isTransientDbError(new Error('SSL connection has been closed unexpectedly'))).toBe(true);
  });

  it('does not retry query or constraint errors', () => {
    expect(isTransientDbError(codeError('23505', 'duplicate key value'))).toBe(false);
    expect(isTransientDbError(codeError('42P01', 'relation does not exist'))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});

describe('withTransientDbRetry', () => {
  it('retries transient errors with exponential backoff', async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const log = vi.fn();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(codeError('CONNECTION_CLOSED'))
      .mockRejectedValueOnce(new Error('Authentication timed out'))
      .mockResolvedValue('ok');

    await expect(withTransientDbRetry('server_logs', fn, { sleep, log })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000]);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt limit', async () => {
    const fn = vi.fn(() => Promise.reject(codeError('CONNECTION_CLOSED')));
    await expect(
      withTransientDbRetry('x', fn, { attempts: 2, sleep: async () => {}, log: () => {} }),
    ).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-transient errors immediately', async () => {
    const fn = vi.fn(() => Promise.reject(codeError('23505', 'duplicate key value')));
    await expect(withTransientDbRetry('x', fn, { sleep: async () => {} })).rejects.toThrow(
      'duplicate key value',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
