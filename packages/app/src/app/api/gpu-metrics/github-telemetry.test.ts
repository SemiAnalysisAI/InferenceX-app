import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as GithubArtifacts from '@/lib/github-artifacts';
import type * as RetirementPolicy from '@semianalysisai/inferencex-db/lib/legacy-amd-smi-policy';
import {
  cutPowerAuditBundle,
  isPowerAuditBundleEntry,
} from '@/components/gpu-power/power-audit-bundle';
import { readZipEntries } from '@/lib/github-artifacts';

const { download, readRun, listArtifacts } = vi.hoisted(() => ({
  download: vi.fn(),
  readRun: vi.fn(),
  listArtifacts: vi.fn(),
}));

vi.mock('@/lib/github-artifacts', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubArtifacts>()),
  downloadGithubArtifact: download,
  fetchGithubWorkflowRun: readRun,
  fetchGithubRunArtifacts: listArtifacts,
}));

vi.mock('@semianalysisai/inferencex-db/lib/legacy-amd-smi-policy', async (importOriginal) => {
  const actual = await importOriginal<typeof RetirementPolicy>();
  return {
    ...actual,
    isRetiredLiveCsv: (runId: number, headSha: string, csv: Buffer) =>
      csv.includes('RETIRE_ONLY') || actual.isRetiredLiveCsv(runId, headSha, csv),
  };
});

import { fetchGpuMetricsFromGithub } from './github-telemetry';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GITHUB_TOKEN', 'controlled-not-a-real-token');
});

afterEach(() => {
  vi.unstubAllEnvs();
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
  it('removes a retired CSV and its bundle fallback while retaining unrelated telemetry', async () => {
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
    listArtifacts.mockResolvedValue([
      {
        id: 1,
        name: 'gpu_metrics_retired',
        archive_download_url: 'https://example.test/retired-csv',
      },
      {
        id: 2,
        name: 'power_audit_retired_bundle',
        archive_download_url: 'https://example.test/retired-bundle',
      },
      { id: 3, name: 'gpu_metrics_other', archive_download_url: 'https://example.test/other-csv' },
      {
        id: 4,
        name: 'power_audit_unrelated_bundle',
        archive_download_url: 'https://example.test/other-bundle',
      },
    ]);
    const retiredCsv =
      'timestamp,gpu,socket_power,gfx_activity,hotspot\n2026-03-01T00:00:00Z,0,535,92,65,RETIRE_ONLY\n';
    const retiredZip = new AdmZip();
    retiredZip.addFile('gpu_metrics.csv', Buffer.from(retiredCsv));
    const bundle = (retired: boolean) => {
      const zip = new AdmZip();
      if (retired) zip.addFile('gpu_metrics.csv', Buffer.from(retiredCsv));
      zip.addFile(
        'LOGS/power/samples.csv',
        Buffer.from(
          'timestamp_unix,hostname,gpu_index,gpu_uuid,power_w\n1772323200,amd-a,0,GPU-a,535\n',
        ),
      );
      zip.addFile(
        'power_validation_result_conc1.json',
        Buffer.from(
          JSON.stringify({
            selected_window: {
              concurrency: 1,
              start_time_unix: 1772323199,
              end_time_unix: 1772323201,
            },
          }),
        ),
      );
      return new Response(new Uint8Array(zip.toBuffer()));
    };
    const unfiltered = readZipEntries(
      Buffer.from(await bundle(true).arrayBuffer()),
      isPowerAuditBundleEntry,
    );
    expect(cutPowerAuditBundle('power_audit_retired_bundle', unfiltered)).toHaveLength(1);
    download.mockImplementation((url: string) => {
      if (url.endsWith('/retired-csv'))
        return Promise.resolve(new Response(new Uint8Array(retiredZip.toBuffer())));
      if (url.endsWith('/retired-bundle')) return Promise.resolve(bundle(true));
      if (url.endsWith('/other-bundle')) return Promise.resolve(bundle(false));
      return Promise.resolve(csvArchive(300));
    });
    const result = await fetchGpuMetricsFromGithub('12345', null, true);
    expect(result.artifacts.map((artifact) => artifact.name)).toEqual([
      'gpu_metrics_retired',
      'gpu_metrics_other',
    ]);
    expect(result.artifacts[0]?.files[0]?.data[0]).toMatchObject({ temperature: 65, gpuUtil: 92 });
    expect(result.artifacts[0]?.files[0]?.data[0]).not.toHaveProperty('power');
    expect(result.artifacts[1]?.files[0]?.data[0]?.power).toBe(300);
    expect(result.bundleSeries.map((series) => series.artifact)).toEqual([
      'power_audit_unrelated_bundle',
    ]);
  });

  it('keeps unverified code-source power until its dispatch path is proven', async () => {
    const source = {
      githubRunId: 26486957776,
      headSha: '7a8a5ab133f20911b7f43d4e70787890e5dfa293',
    };
    readRun.mockResolvedValue(
      Response.json({
        id: source.githubRunId,
        name: 'Controlled sweep',
        head_branch: 'main',
        head_sha: source.headSha,
        created_at: '2026-03-01T00:00:00Z',
        html_url: `https://example.test/runs/${source.githubRunId}`,
        conclusion: 'success',
        status: 'completed',
      }),
    );
    listArtifacts.mockResolvedValue([
      { id: 1, name: 'gpu_metrics_amd', archive_download_url: 'https://example.test/amd' },
      { id: 2, name: 'gpu_metrics_nvidia', archive_download_url: 'https://example.test/nvidia' },
    ]);
    const amdZip = new AdmZip();
    amdZip.addFile(
      'gpu_metrics.csv',
      Buffer.from(
        'timestamp,gpu,socket_power,gfx_activity,hotspot\n2026-03-01T00:00:00Z,0,535,92,65\n',
      ),
    );
    download.mockImplementation((url: string) =>
      url.endsWith('/amd') ? new Response(new Uint8Array(amdZip.toBuffer())) : csvArchive(300),
    );
    const result = await fetchGpuMetricsFromGithub(String(source.githubRunId), null, false);
    expect(result.artifacts.map((artifact) => artifact.name)).toEqual([
      'gpu_metrics_amd',
      'gpu_metrics_nvidia',
    ]);
    expect(result.artifacts[0]?.files[0]?.data).toEqual([
      expect.objectContaining({ index: 0, gpuUtil: 92, temperature: 65 }),
    ]);
    expect(result.artifacts[0]?.files[0]?.data[0]?.power).toBe(535);
  });

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
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(4));
    pending[3].resolve(csvArchive(303));
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(5));
    pending[1].reject(new Error('archive unavailable'));
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(6));
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
