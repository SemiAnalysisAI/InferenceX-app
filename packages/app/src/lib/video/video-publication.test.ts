import { describe, expect, it, vi } from 'vitest';
import { publishVideoResults } from './video-publication';

describe('explicit video publication job', () => {
  it('submits only unique artifacts from the selected source run, including an existing index', async () => {
    const get = vi.fn().mockResolvedValue({
      artifacts: [
        { id: 20, name: 'h3-video-10-1', stored: true },
        { id: 20, name: 'h3-video-10-1' },
        { id: 21, expired: true },
        { id: 22, name: 'h3-video-10-2' },
      ],
    });
    const post = vi.fn((body: { runId: string; artifactId: string }) =>
      Promise.resolve({
        version: 1,
        runId: body.runId,
        artifactId: Number(body.artifactId),
        artifactName: `h3-video-10-${body.artifactId === '20' ? '1' : '2'}`,
        mergeRunId: '99',
        sources: [{}, {}],
      }),
    );
    const onStored = vi.fn();
    await publishVideoResults({ get, post, runId: '10', mergeRunId: '99', onStored });
    expect(get).toHaveBeenCalledExactlyOnceWith('?run=10');
    expect(post.mock.calls.map(([body]) => body)).toEqual([
      { runId: '10', artifactId: '20', mergeRunId: '99' },
      { runId: '10', artifactId: '22', mergeRunId: '99' },
    ]);
    expect(onStored.mock.calls).toEqual([
      ['10', '20', 2],
      ['10', '22', 2],
    ]);
  });

  it('reports one failed artifact while still publishing the later exact artifact', async () => {
    const get = vi.fn().mockResolvedValue({
      artifacts: [
        { id: 20, name: 'h3-video-10-1' },
        { id: 21, name: 'h3-video-10-2' },
      ],
    });
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error('checksum mismatch'))
      .mockResolvedValueOnce({
        version: 1,
        runId: '10',
        artifactId: 21,
        artifactName: 'h3-video-10-2',
        mergeRunId: null,
        sources: [{}],
      });
    const onStored = vi.fn();
    await expect(
      publishVideoResults({ get, post, runId: '10', mergeRunId: null, onStored }),
    ).rejects.toThrow('1 video publications failed');
    expect(onStored).toHaveBeenCalledExactlyOnceWith('10', '21', 1);
  });

  it('requires an explicit source and rejects an empty artifact list', async () => {
    const get = vi.fn().mockResolvedValue({ artifacts: [] });
    const post = vi.fn();
    for (const runId of ['', '0', '../all'])
      await expect(
        publishVideoResults({ get, post, runId, mergeRunId: null, onStored: vi.fn() }),
      ).rejects.toThrow('Invalid H3_RUN_ID');
    expect(get).not.toHaveBeenCalled();
    await expect(
      publishVideoResults({ get, post, runId: '10', mergeRunId: null, onStored: vi.fn() }),
    ).rejects.toThrow('No H3 artifact');
    expect(post).not.toHaveBeenCalled();
  });
});
