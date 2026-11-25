import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
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
      if (!('artifactId' in body)) throw new Error('Expected a republication');
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
    await publishVideoResults({ get, post, runId: '10', mergeRunId: null, onStored });
    expect(get).toHaveBeenCalledExactlyOnceWith('?run=10');
    expect(post.mock.calls.map(([body]) => body)).toEqual([
      { runId: '10', artifactId: '20', mergeRunId: null },
      { runId: '10', artifactId: '22', mergeRunId: null },
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
    const seal = 'd'.repeat(64);
    const selection = {
      version: 1,
      source_run_id: '10',
      source_run_attempt: '2',
      source_head_sha: 'c'.repeat(40),
      artifacts: [{ name, manifest_sha256: hash, sha256sums_sha256: seal }],
    };
    const artifacts = [
      { id: 20, name: `h3-results-10-1-${config}` },
      { id: 21, name },
    ];
    const get = vi.fn().mockResolvedValue({ artifacts });
    const post = vi.fn().mockResolvedValue({
      version: 2,
      runId: '10',
      artifactId: 21,
      artifactName: name,
      mergeRunId: '99',
      selected: { manifestSha256: hash, sha256sumsSha256: seal },
      sources: [{ id: '10', kind: 'observation', sha256: hash }],
    });
    const input = { get, post, runId: '10', mergeRunId: '99', selection, onStored: vi.fn() };
    await publishVideoResults(input);
    expect(post).toHaveBeenCalledExactlyOnceWith({
      runId: '10',
      mergeRunId: '99',
      selectedArtifact: { id: '21', manifestSha256: hash, sha256sumsSha256: seal },
    });
    post.mockClear();
    for (const listing of [[artifacts[0]], [...artifacts, { id: 22, name }]]) {
      get.mockResolvedValueOnce({ artifacts: listing });
      await expect(publishVideoResults(input)).rejects.toThrow(/selected artifact/i);
    }
    // The selection must name each bundle's SHA256SUMS.
    const unsealed = { ...selection, artifacts: [{ name, manifest_sha256: hash }] };
    await expect(publishVideoResults({ ...input, selection: unsealed })).rejects.toThrow(
      'Invalid selected artifact identity',
    );
    expect(post).not.toHaveBeenCalled();
    // A receipt written before merge selections cannot answer a selected publication.
    post.mockResolvedValueOnce({
      version: 1,
      runId: '10',
      artifactId: 21,
      artifactName: name,
      mergeRunId: '99',
      sources: [{ id: '10', kind: 'observation', sha256: hash }],
    });
    await expect(publishVideoResults(input)).rejects.toThrow('1 video publications failed');
  });

  it('refuses a merge run without its selection and never approves without a merge run', async () => {
    const artifacts = [
      { id: 20, name: 'h3-video-10-1', stored: true },
      { id: 21, name: 'h3-video-10-2' },
    ];
    const get = vi.fn().mockResolvedValue({ artifacts });
    const post = vi.fn();
    const input = { get, post, runId: '10', onStored: vi.fn() };
    await expect(publishVideoResults({ ...input, mergeRunId: '99' })).rejects.toThrow(
      'A merge run and its selection are required together',
    );
    await expect(
      publishVideoResults({ ...input, mergeRunId: null, selection: { version: 1 } }),
    ).rejects.toThrow('A merge run and its selection are required together');
    expect(get).not.toHaveBeenCalled();
    // Null is the App's answer for an artifact it never approved: nothing is published.
    post.mockResolvedValue(null);
    await expect(publishVideoResults({ ...input, mergeRunId: null })).rejects.toThrow(
      'No approved H3 artifact to republish',
    );
    expect(post.mock.calls.map(([body]) => body)).toEqual([
      { runId: '10', mergeRunId: null, artifactId: '20' },
      { runId: '10', mergeRunId: null, artifactId: '21' },
    ]);
    expect(input.onStored).not.toHaveBeenCalled();
  });

  it('reads no selection unless its artifact comes from a merge-ingest push to main', () => {
    const script = resolve(
      import.meta.dirname,
      '../../../scripts/read-video-publication-selection.py',
    );
    const directory = mkdtempSync(join(tmpdir(), 'video-selection-'));
    try {
      // A stand-in `gh` that answers the reader's two metadata calls from RUN_JSON.
      writeFileSync(
        join(directory, 'gh'),
        `#!/bin/sh
case "$2" in
  */actions/runs/99) printf '%s' "$RUN_JSON" ;;
  */actions/artifacts/7) printf '%s' '{"id":7,"name":"video-publication-selection","expired":false,"workflow_run":{"id":99}}' ;;
  *) exit 1 ;;
esac
`,
      );
      chmodSync(join(directory, 'gh'), 0o755);
      const payload = {
        source_run_id: '10',
        merge_run_id: '99',
        selection_artifact_id: '7',
      };
      const repo = { full_name: 'SemiAnalysisAI/InferenceX' };
      const mergeRun = {
        id: 99,
        event: 'push',
        path: '.github/workflows/merge-ingest.yml',
        head_branch: 'main',
        repository: repo,
        head_repository: repo,
      };
      const read = (client_payload: object, run: object) => {
        writeFileSync(join(directory, 'event.json'), JSON.stringify({ client_payload }));
        writeFileSync(join(directory, 'output'), '');
        const result = spawnSync('python3', [script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${directory}${delimiter}${process.env.PATH}`,
            RUN_JSON: JSON.stringify(run),
            GITHUB_EVENT_PATH: join(directory, 'event.json'),
            GITHUB_OUTPUT: join(directory, 'output'),
            RUNNER_TEMP: directory,
          },
        });
        return `${result.status} ${result.stderr.trim().split('\n').at(-1)}`;
      };
      const refused = '1 ValueError: Selection artifact does not belong to the main merge workflow';
      for (const forged of [
        { event: 'pull_request' },
        { event: 'workflow_dispatch' },
        { path: '.github/workflows/run-sweep.yml' },
        { head_branch: 'feature' },
        { head_repository: { full_name: 'fork/InferenceX' } },
      ])
        expect(read(payload, { ...mergeRun, ...forged })).toBe(refused);
      // A dispatch that names no selection is refused before any GitHub read.
      const { selection_artifact_id: _id, ...bare } = payload;
      expect(read(bare, mergeRun)).toBe(
        '1 ValueError: Invalid video publication selection reference',
      );
      // The genuine merge run passes this check and stops at the artifact download instead.
      expect(read(payload, mergeRun)).toMatch(/^1 .*CalledProcessError/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
