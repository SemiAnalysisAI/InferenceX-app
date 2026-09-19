import { describe, expect, it, vi } from 'vitest';

import { NonRetryableArtifactError, retryArtifactOperation } from './artifact-retry.js';

describe('retryArtifactOperation', () => {
  it('retries transient failures using the configured delays', async () => {
    const operation = vi
      .fn<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('temporary DNS failure');
      })
      .mockImplementationOnce(() => {
        throw new Error('temporary TLS failure');
      })
      .mockReturnValue('downloaded');
    const wait = vi.fn<(delayMs: number) => Promise<void>>(() => Promise.resolve());
    const warn = vi.fn<(message: string) => void>();

    await expect(
      retryArtifactOperation('artifact', operation, { delaysMs: [5, 15], wait, warn }),
    ).resolves.toBe('downloaded');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[5], [15]]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('throws the final error after exhausting retries', async () => {
    const failure = new Error('still unavailable');
    const wait = vi.fn<(delayMs: number) => Promise<void>>(() => Promise.resolve());

    await expect(
      retryArtifactOperation(
        'artifact',
        () => {
          throw failure;
        },
        { delaysMs: [1], wait, warn: () => {} },
      ),
    ).rejects.toBe(failure);
    expect(wait).toHaveBeenCalledOnce();
  });

  it('rethrows a non-retryable failure at once without waiting or warning', async () => {
    // A deleted run 404s forever; sleeping through the full backoff schedule
    // (~3.8 min at the default delays) per such run would stall a history sweep.
    const gone = new NonRetryableArtifactError('run is gone');
    const operation = vi.fn(() => {
      throw gone;
    });
    const wait = vi.fn<(delayMs: number) => Promise<void>>(() => Promise.resolve());
    const warn = vi.fn<(message: string) => void>();

    await expect(
      retryArtifactOperation('artifact', operation, { delaysMs: [5, 15], wait, warn }),
    ).rejects.toBe(gone);
    expect(operation).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
