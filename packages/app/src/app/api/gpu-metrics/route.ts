/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import { type NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';

import { parseCsvData } from '@/components/gpu-power/types';
import {
  parsePowerAuditEntries,
  type PowerAuditArtifact,
} from '@/components/gpu-power/power-audit';
import {
  downloadGithubArtifact,
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  normalizeGithubRunInfo,
  type GithubWorkflowRun,
} from '@/lib/github-artifacts';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

async function fetchGpuMetrics(runId: string, powerAudit: boolean) {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  const prefix = powerAudit ? 'power_audit_' : 'gpu_metrics';
  const gpuArtifacts = artifacts.filter((a) => a.name.startsWith(prefix));
  if (gpuArtifacts.length === 0) throw new Error(`No ${prefix} artifacts found for this run`);

  const parsedArtifacts: { name: string; data: ReturnType<typeof parseCsvData> }[] = [];
  const powerAudits: PowerAuditArtifact[] = [];
  for (const artifact of gpuArtifacts) {
    const dlResp = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
    if (!dlResp.ok) {
      console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
      continue;
    }

    const contentLength = dlResp.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_ARTIFACT_BYTES) {
      console.warn(`Artifact ${artifact.name} exceeds 50 MB, skipping`);
      continue;
    }

    const buffer = Buffer.from(await dlResp.arrayBuffer());
    if (buffer.byteLength > MAX_ARTIFACT_BYTES) continue;
    if (powerAudit) {
      try {
        const entries: Record<string, string> = {};
        let expandedBytes = 0;
        for (const entry of new AdmZip(buffer).getEntries()) {
          if (
            !/(?:LOGS\/power\/(?:manifest\.json|samples\.csv|windows\/[^/]+\.json)|(?:^|\/)power_validation_[^/]+\.json)$/u.test(
              entry.entryName,
            )
          )
            continue;
          expandedBytes += entry.header.size;
          if (expandedBytes > MAX_ARTIFACT_BYTES)
            throw new Error('Expanded power audit exceeds 50 MB');
          entries[entry.entryName] = entry.getData().toString('utf8');
        }
        powerAudits.push({
          id: artifact.id,
          name: artifact.name,
          ...parsePowerAuditEntries(entries),
        });
      } catch (error) {
        console.warn(`Failed to parse power audit ${artifact.name}:`, error);
      }
      continue;
    }
    const rows = extractZipEntries(
      buffer,
      '.csv',
      (_entryName, contents) => parseCsvData(contents),
      (entryName, error) => {
        console.warn(`Failed to parse CSV ${entryName} from ${artifact.name}:`, error);
      },
    );
    if (rows.length > 0) parsedArtifacts.push({ name: artifact.name, data: rows });
  }

  if (powerAudit) {
    if (powerAudits.length === 0)
      throw new Error('No serving-window power audit data found in artifacts');
    return { runInfo: normalizeGithubRunInfo(run), powerAudits };
  }
  if (parsedArtifacts.length === 0) throw new Error('No Chip metrics data found in artifacts');

  return {
    runInfo: normalizeGithubRunInfo(run),
    artifacts: parsedArtifacts,
  };
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId');
  const source = request.nextUrl.searchParams.get('source');

  if (!runId || !/^\d+$/u.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric workflow run ID' }, { status: 400 });
  }
  if (source !== null && source !== 'power-audit') {
    return NextResponse.json(
      { error: 'source must be power-audit when specified' },
      { status: 400 },
    );
  }

  try {
    const data = await fetchGpuMetrics(runId, source === 'power-audit');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 },
    );
  }
}
