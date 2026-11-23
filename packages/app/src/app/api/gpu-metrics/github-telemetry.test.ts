import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { stubEnv, unstubAllEnvs, waitFor } from '@/test/helpers';

const { download, readRun, listArtifacts } = {
  download: vi.fn(),
  readRun: vi.fn(),
  listArtifacts: vi.fn(),
};

const actual = { ...(await import('@/lib/github/github-artifacts')) };
mock.module('@/lib/github/github-artifacts', () => ({
  ...actual,
  downloadGithubArtifact: download,
  fetchGithubWorkflowRun: readRun,
  listGithubRunArtifacts: listArtifacts,
}));

import { fetchGpuMetricsFromGithub } from './github-telemetry';

beforeEach(() => {
  vi.clearAllMocks();
  stubEnv('GITHUB_TOKEN', 'controlled-not-a-real-token');
});

afterEach(() => {
  unstubAllEnvs();
});

function csvArchive(power: number): Response {
  const zip = new AdmZip();
  zip.addFile(
    'gpu_metrics.csv',
    Buffer.from(
      'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]\n' +
        `2026/03/01 00:00:00.000, 0, ${power} W, 65, 1500, 2000, 95, 80\n`,
    ),
  );
  return new Response(new Uint8Array(zip.toBuffer()));
}

describe('live telemetry acquisition', () => {
  it('bounds downloads to four and preserves listing order after an isolated failure', async () => {
    readRun.mockResolvedValue(
      Response.json({
        id: 12345,
        name: 'Controlled sweep',
        head_branch: 'main',
        head_sha: 'fixture',
        created_at: '2026-03-01T00:00:00Z',
        html_url: 'https://example.test/runs/12345',
        conclusion: 'success',
        status: 'completed',
      }),
    );
    const artifacts = Array.from({ length: 6 }, (_, index) => ({
      id: index,
      name: `gpu_metrics_dsr1_conc${index + 1}`,
      archive_download_url: `https://example.test/download/${index}`,
    }));
    listArtifacts.mockResolvedValue(artifacts);
    const pending = artifacts.map(() => Promise.withResolvers<Response>());
    download.mockImplementation((url: string) => pending[Number(url.split('/').at(-1))].promise);

    const response = fetchGpuMetricsFromGithub('12345', 'dsr1_', false);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(4));
    pending[3].resolve(csvArchive(303));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(5));
    pending[1].reject(new Error('archive unavailable'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(6));
    for (const index of [5, 4, 2, 0]) pending[index].resolve(csvArchive(300 + index));

    const result = await response;
    expect(result.artifacts.map((artifact) => artifact.name)).toEqual(
      [0, 2, 3, 4, 5].map((index) => artifacts[index].name),
    );
    expect(result.artifacts.map((artifact) => artifact.files[0].data[0].power)).toEqual([
      300, 302, 303, 304, 305,
    ]);
    expect(result.bundleSeries).toEqual([]);
  });
});
