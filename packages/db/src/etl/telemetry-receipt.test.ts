import { describe, expect, it } from 'vitest';

import { telemetryArtifactsForAttempt } from './telemetry-receipt';

describe('telemetry attachment receipts', () => {
  it('isolates the source attempt before selecting or downloading artifact pairs', () => {
    const old = {
      name: 'gpu_metrics_old',
      created_at: '2026-09-20T00:00:00Z',
      archive_download_url: 'old',
    };
    const current = {
      name: 'gpu_metrics_new',
      created_at: '2026-09-21T01:00:00Z',
      archive_download_url: 'new',
    };
    const source = { run_attempt: 2, run_started_at: '2026-09-21T00:00:00Z' };
    expect(telemetryArtifactsForAttempt([old, current], source, 2)).toEqual([current]);
    expect(() => telemetryArtifactsForAttempt([old, current], source, 1)).toThrow('mixed-attempt');
    expect(() => telemetryArtifactsForAttempt([current], { run_attempt: 2 }, 2)).toThrow(
      'start time',
    );
  });
});
