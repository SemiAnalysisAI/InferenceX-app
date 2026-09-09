import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { readStoredArtifact, storedArtifacts, videoStorageEnabled } from '@/lib/video-storage';

vi.mock('@/lib/video-storage', () => ({
  videoStorageEnabled: vi.fn(() => false),
  storedArtifacts: vi.fn(() => Promise.resolve([])),
  readStoredArtifact: vi.fn(),
  storeVideoArtifact: vi.fn(),
}));
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
const response = (body: unknown, status = 200) => Response.json(body, { status });
const request = (query = '') => new NextRequest(`http://localhost/api/video-runs${query}`);
afterEach(() => {
  fetchMock.mockReset();
  vi.mocked(videoStorageEnabled).mockReturnValue(false);
  vi.mocked(storedArtifacts).mockResolvedValue([]);
  vi.mocked(readStoredArtifact).mockReset();
  vi.restoreAllMocks();
});

describe('H3 CI artifact access', () => {
  it('discovers benchmark runs without including branch-named unit jobs', async () => {
    fetchMock.mockResolvedValueOnce(response({ private: false })).mockResolvedValueOnce(
      response({
        workflow_runs: [
          { id: 1, name: 'e2e Test - h3-8s', path: '.github/workflows/e2e-tests.yml' },
          { id: 2, name: 'Test H3 Video', path: '.github/workflows/test-h3-video.yml' },
          { id: 3, name: 'H3 Video Smoke', path: '.github/workflows/h3-video.yml' },
          { id: 4, name: 'H3 retained-media fidelity', path: '.github/workflows/h3-fidelity.yml' },
        ],
      }),
    );
    const result = await GET(request());
    const data = await result.json();
    expect(data.runs.map((r: { id: number }) => r.id)).toEqual([1, 3, 4]);
    expect(result.headers.get('cache-control')).toContain('no-store');
  });
  it('refuses a private repository before reading any artifacts', async () => {
    fetchMock.mockResolvedValueOnce(response({ private: true }));
    const result1 = await GET(request('?run=10&artifact=20'));
    expect(result1.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects unrelated or mismatched artifact identities', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response({ name: 'h3-video-11-1', workflow_run: { id: 11 } }));
    const result2 = await GET(request('?run=10&artifact=20'));
    expect(result2.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('keeps expired artifacts explicit', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(
        response({ name: 'h3-results-10-1', workflow_run: { id: 10 }, expired: true }),
      );
    const result3 = await GET(request('?run=10&artifact=20'));
    expect(result3.status).toBe(410);
  });
  it('streams the verified run artifact with a deadline longer than metadata requests', async () => {
    const deadline = new AbortController().signal;
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => (ms === 270000 ? deadline : new AbortController().signal));
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(
        response({
          name: 'h3-results-10-1',
          workflow_run: { id: 10 },
          size_in_bytes: 4,
          archive_download_url: 'https://evil.example',
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4])));
    const result = await GET(request('?run=10&artifact=20'));
    expect(timeout).toHaveBeenCalledWith(270000);
    expect(fetchMock.mock.calls[2][1]?.signal).toBe(deadline);
    expect(fetchMock.mock.calls[0][1]?.signal).not.toBe(deadline);
    expect(result.headers.get('content-type')).toBe('application/zip');
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([80, 75, 3, 4]);
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      'https://api.github.com/repos/SemiAnalysisAI/InferenceX/actions/artifacts/20/zip',
    );
  });
  it('rejects oversized artifacts before downloading', async () => {
    fetchMock.mockResolvedValueOnce(response({ private: false })).mockResolvedValueOnce(
      response({
        name: 'h3-video-10-1',
        workflow_run: { id: 10 },
        size_in_bytes: 300 * 1024 ** 2,
      }),
    );
    const result4 = await GET(request('?run=10&artifact=20'));
    expect(result4.status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('shows a run with no result artifact without substituting another run', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response({ id: 10, conclusion: 'failure' }))
      .mockResolvedValueOnce(response({ artifacts: [{ id: 20, name: 'other-artifact' }] }));
    const result = await GET(request('?run=10'));
    expect(await result.json()).toEqual({
      run: { id: 10, conclusion: 'failure' },
      artifacts: [],
    });
  });
  it('falls back to the CI ZIP when object storage is not configured', async () => {
    fetchMock.mockResolvedValueOnce(response({ private: false }));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('serves a persisted result without fetching an expired GitHub artifact', async () => {
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    const artifact = {
      id: 20,
      name: 'h3-results-10-1',
      expired: false,
      size_in_bytes: 4,
      stored: true,
    };
    const saved = { storageVersion: 1 as const, runId: '10', artifact, sources: [] };
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved);
    fetchMock.mockResolvedValueOnce(response({ private: false }));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(await result.json()).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('retains stored artifacts after GitHub removes them from the run', async () => {
    const artifact = {
      id: 20,
      name: 'h3-results-10-1',
      expired: false,
      size_in_bytes: 0,
      stored: true,
    };
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response({ id: 10, conclusion: 'success' }))
      .mockResolvedValueOnce(response({ artifacts: [] }));
    const result = await GET(request('?run=10'));
    const data = await result.json();
    expect(data.artifacts).toEqual([artifact]);
  });
  it('loads independent run lookups together after checking repository visibility', async () => {
    let finishRun!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishRun = resolve;
        }),
      )
      .mockResolvedValueOnce(response({ artifacts: [] }));
    const pending = GET(request('?run=10'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2][0])).toContain('/actions/runs/10/artifacts');
    finishRun(response({ id: 10 }));
    const result = await pending;
    expect(result.status).toBe(200);
  });
  it('rejects invalid identifiers without making requests', async () => {
    const result5 = await GET(request('?run=../secret'));
    expect(result5.status).toBe(400);
    const result6 = await GET(request('?artifact=123'));
    expect(result6.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
