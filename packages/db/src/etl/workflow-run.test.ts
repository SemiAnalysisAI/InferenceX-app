import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { createWorkflowRunServices } from './workflow-run';

const RUN_ID = 12_345_678_901;

function runResponse(repo: string): Response {
  return Response.json({
    name: 'Run Sweep',
    status: 'completed',
    conclusion: 'success',
    html_url: `https://github.com/${repo}/actions/runs/${RUN_ID}`,
    created_at: '2026-08-01T12:00:00Z',
    run_started_at: '2026-08-01T12:00:30Z',
    head_sha: '0123456789abcdef0123456789abcdef01234567',
    head_branch: 'sweep-updates',
    head_commit: { message: 'Add sweep' },
    run_attempt: 2,
    pull_requests: [{ number: 12 }],
    repository: { html_url: `https://github.com/${repo}` },
  });
}

const notFound = () => new Response(null, { status: 404, statusText: 'Not Found' });

function stubFetch(...responses: Response[]): Mock {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const requestedUrls = (fetchMock: Mock) => fetchMock.mock.calls.map(([url]) => url);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('fetchGithubRun', () => {
  it('searches the primary and then the legacy repository by default', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', undefined);
    const fetchMock = stubFetch(notFound(), runResponse('InferenceMAX/InferenceMAX'));

    const { fetchGithubRun } = createWorkflowRunServices({} as never, 'test-token');
    const run = await fetchGithubRun(RUN_ID);

    expect(run).toEqual({
      name: 'Run Sweep',
      status: 'completed',
      conclusion: 'success',
      htmlUrl: `https://github.com/InferenceMAX/InferenceMAX/actions/runs/${RUN_ID}`,
      createdAt: '2026-08-01T12:00:00Z',
      runStartedAt: '2026-08-01T12:00:30Z',
      headSha: '0123456789abcdef0123456789abcdef01234567',
      headBranch: 'sweep-updates',
      headCommitMessage: 'Add sweep',
      runAttempt: 2,
      pullRequests: [
        { number: 12, htmlUrl: 'https://github.com/InferenceMAX/InferenceMAX/pull/12' },
      ],
    });
    expect(requestedUrls(fetchMock)).toEqual([
      `https://api.github.com/repos/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`,
      `https://api.github.com/repos/InferenceMAX/InferenceMAX/actions/runs/${RUN_ID}`,
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('resolves runs from configured source repositories before the legacy repository', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a,example-org/bench-b');
    const fetchMock = stubFetch(notFound(), notFound(), runResponse('example-org/bench-b'));

    const { fetchGithubRun } = createWorkflowRunServices({} as never, 'test-token');
    const run = await fetchGithubRun(RUN_ID);

    expect(run).toMatchObject({
      htmlUrl: `https://github.com/example-org/bench-b/actions/runs/${RUN_ID}`,
      runAttempt: 2,
    });
    expect(requestedUrls(fetchMock)).toEqual([
      `https://api.github.com/repos/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`,
      `https://api.github.com/repos/example-org/bench-a/actions/runs/${RUN_ID}`,
      `https://api.github.com/repos/example-org/bench-b/actions/runs/${RUN_ID}`,
    ]);
  });

  it('caches a run that no repository has', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a');
    const fetchMock = stubFetch(notFound(), notFound(), notFound());

    const { fetchGithubRun } = createWorkflowRunServices({} as never, 'test-token');

    await expect(fetchGithubRun(RUN_ID)).resolves.toBeNull();
    await expect(fetchGithubRun(RUN_ID)).resolves.toBeNull();
    expect(requestedUrls(fetchMock)).toEqual([
      `https://api.github.com/repos/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`,
      `https://api.github.com/repos/example-org/bench-a/actions/runs/${RUN_ID}`,
      `https://api.github.com/repos/InferenceMAX/InferenceMAX/actions/runs/${RUN_ID}`,
    ]);
  });

  it('searches only an explicitly passed repository list', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a');
    const fetchMock = stubFetch(runResponse('example-org/single'));

    const { fetchGithubRun } = createWorkflowRunServices({} as never, 'test-token', [
      'example-org/single',
    ]);

    await expect(fetchGithubRun(RUN_ID)).resolves.toMatchObject({ runAttempt: 2 });
    expect(requestedUrls(fetchMock)).toEqual([
      `https://api.github.com/repos/example-org/single/actions/runs/${RUN_ID}`,
    ]);
  });
});
