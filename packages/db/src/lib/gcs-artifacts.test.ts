import { describe, expect, it, vi } from 'vitest';

import {
  listGcsServerLogArtifacts,
  parseGcsArtifactObject,
  publicGcsObjectUrl,
} from './gcs-artifacts.js';

describe('GCS artifact backup', () => {
  it('parses benchmark and server-log ZIPs while preserving the runner suffix', () => {
    expect(
      parseGcsArtifactObject({
        name:
          '2026-03-04/Run_Sweep_-_main_12345678901/artifacts/' +
          'server_logs_cfg_h200-cw_7_9876543210.zip',
        size: '4096',
        updated: '2026-03-05T00:00:00Z',
      }),
    ).toMatchObject({
      runId: 12345678901,
      artifact: {
        id: 9876543210,
        name: 'server_logs_cfg_h200-cw_7',
        size: 4096,
      },
    });
  });

  it('ignores unrelated artifacts and malformed object paths', () => {
    expect(
      parseGcsArtifactObject({
        name: '2026-03-04/Run_12345678901/artifacts/eval_cfg_9876543210.zip',
      }),
    ).toBeNull();
    expect(parseGcsArtifactObject({ name: 'not-an-artifact.zip' })).toBeNull();
  });

  it('encodes public object path segments without escaping separators', () => {
    expect(publicGcsObjectUrl('2026-01-01/a folder/artifacts/a+b.zip')).toBe(
      'https://storage.googleapis.com/inferencemax-gha-backup/' +
        '2026-01-01/a%20folder/artifacts/a%2Bb.zip',
    );
  });

  it('paginates the public bucket index and groups useful artifacts by run', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              name: '2026-01-01/Sweep_12345678901/artifacts/bmk_cfg_pool_0_1000000001.zip',
              size: '20',
              updated: '2026-01-02T00:00:00Z',
            },
          ],
          nextPageToken: 'next',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              name: '2026-01-01/Sweep_12345678901/artifacts/server_logs_cfg_pool_0_1000000002.zip',
              size: '30',
              updated: '2026-01-02T00:00:01Z',
            },
            {
              name: '2026-01-01/Sweep_12345678901/artifacts/eval_cfg_1000000003.zip',
              size: '40',
            },
          ],
        }),
      );

    const byRun = await listGcsServerLogArtifacts(fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('pageToken=next');
    expect(byRun.get(12345678901)?.map((artifact) => artifact.name)).toEqual([
      'bmk_cfg_pool_0',
      'server_logs_cfg_pool_0',
    ]);
  });
});
