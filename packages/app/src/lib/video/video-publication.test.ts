import { describe, expect, it, vi } from 'bun:test';
import { publishVideoResults, type VideoPublicationRequest } from './video-publication';

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
    const post = vi.fn((body: VideoPublicationRequest) => {
      if (!('artifactId' in body)) throw new Error('Expected a legacy publication');
      return Promise.resolve({
        version: 1,
        runId: body.runId,
        artifactId: Number(body.artifactId),
        artifactName: `h3-video-10-${body.artifactId === '20' ? '1' : '2'}`,
        mergeRunId: '99',
        sources: [{}, {}],
        quality: body.artifactId === '20' ? 20 : null,
      });
    });
    const onStored = vi.fn();
    await publishVideoResults({ get, post, runId: '10', mergeRunId: '99', onStored });
    expect(get).toHaveBeenCalledExactlyOnceWith('?run=10');
    expect(post.mock.calls.map(([body]) => body)).toEqual([
      { runId: '10', artifactId: '20', mergeRunId: '99' },
      { runId: '10', artifactId: '22', mergeRunId: '99' },
    ]);
    expect(onStored.mock.calls).toEqual([
      ['10', '20', 2, 20],
      ['10', '22', 2, null],
    ]);
  });

  it('publishes the exact recipe attempts selected by the merge and refuses an incomplete catalog', async () => {
    const config = 'a'.repeat(64);
    const name = `h3-results-10-2-${config}`;
    const hash = 'b'.repeat(64);
    const selection = {
      version: 1,
      source_run_id: '10',
      source_run_attempt: '2',
      source_head_sha: 'c'.repeat(40),
      artifacts: [{ name, manifest_sha256: hash }],
    };
    const artifacts = [
      { id: 20, name: `h3-results-10-1-${config}` },
      { id: 21, name },
    ];
    const get = vi.fn().mockResolvedValue({ artifacts });
    const post = vi.fn().mockResolvedValue({
      version: 1,
      runId: '10',
      artifactId: 21,
      artifactName: name,
      mergeRunId: '99',
      sources: [{ id: '10', kind: 'observation', sha256: hash }],
    });
    const input = { get, post, runId: '10', mergeRunId: '99', selection, onStored: vi.fn() };
    await publishVideoResults(input);
    expect(post).toHaveBeenCalledExactlyOnceWith({
      runId: '10',
      mergeRunId: '99',
      selectedArtifact: {
        id: '21',
        manifestSha256: hash,
        sourceHeadSha: selection.source_head_sha,
      },
    });
    post.mockClear();
    for (const listing of [[artifacts[0]], [...artifacts, { id: 22, name }]]) {
      get.mockResolvedValueOnce({ artifacts: listing });
      await expect(publishVideoResults(input)).rejects.toThrow(/selected artifact/i);
    }
    expect(post).not.toHaveBeenCalled();
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
        // A manual republish returns the approval recorded by the original dispatch.
        mergeRunId: '99',
        sources: [{}],
        quality: 'failed',
      });
    const onStored = vi.fn();
    await expect(
      publishVideoResults({ get, post, runId: '10', mergeRunId: null, onStored }),
    ).rejects.toThrow('1 video publications failed');
    expect(onStored).toHaveBeenCalledExactlyOnceWith('10', '21', 1, 'failed');
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
