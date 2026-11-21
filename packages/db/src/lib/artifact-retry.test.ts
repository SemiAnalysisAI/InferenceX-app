import { describe, expect, it, mock } from 'bun:test';

import { retryArtifactOperation } from './artifact-retry.js';

describe('retryArtifactOperation', () => {
  it('retries transient failures using the configured delays', async () => {
    const operation = mock<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('temporary DNS failure');
      })
      .mockImplementationOnce(() => {
        throw new Error('temporary TLS failure');
      })
      .mockReturnValue('downloaded');
    const wait = mock<(delayMs: number) => Promise<void>>(() => Promise.resolve());
    const warn = mock<(message: string) => void>();

    await expect(
      retryArtifactOperation('artifact', operation, { delaysMs: [5, 15], wait, warn }),
    ).resolves.toBe('downloaded');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[5], [15]]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('throws the final error after exhausting retries', async () => {
    const failure = new Error('still unavailable');
    const wait = mock<(delayMs: number) => Promise<void>>(() => Promise.resolve());

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
});
