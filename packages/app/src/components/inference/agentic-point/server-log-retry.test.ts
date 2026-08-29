import { describe, expect, it, vi } from 'vitest';

import { retryInitialServerLogQuery } from './server-log-viewer';

describe('retryInitialServerLogQuery', () => {
  it('retries the file inventory when that initial query failed', () => {
    const refetchFiles = vi.fn();
    const refetchContent = vi.fn();

    retryInitialServerLogQuery(true, refetchFiles, refetchContent);

    expect(refetchFiles).toHaveBeenCalledOnce();
    expect(refetchContent).not.toHaveBeenCalled();
  });

  it('retries the selected file content after an initial content failure', () => {
    const refetchFiles = vi.fn();
    const refetchContent = vi.fn();

    retryInitialServerLogQuery(false, refetchFiles, refetchContent);

    expect(refetchFiles).not.toHaveBeenCalled();
    expect(refetchContent).toHaveBeenCalledOnce();
  });
});
