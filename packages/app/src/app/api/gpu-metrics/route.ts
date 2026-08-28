/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { parseCsvData, type GpuArtifactPower } from '@/components/gpu-power/types';
import {
  downloadGithubArtifact,
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  normalizeGithubRunInfo,
  type GithubArtifact,
  type GithubWorkflowRun,
} from '@/lib/github-artifacts';
import {
  mergeArtifactPower,
  powerFromAggRow,
  powerFromValidationSidecar,
  selectValidationEntry,
  siblingArtifactNames,
} from '@/lib/power-audit-artifacts';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

interface ZipJsonEntry {
  entryName: string;
  json: Record<string, unknown>;
}

/** Download an artifact ZIP and parse its .json entries; null on any failure. */
async function downloadJsonEntries(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<ZipJsonEntry[] | null> {
  const dlResp = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
  if (!dlResp.ok) {
    console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
    return null;
  }

  const contentLength = dlResp.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_ARTIFACT_BYTES) {
    console.warn(`Artifact ${artifact.name} exceeds 50 MB, skipping`);
    return null;
  }

  return extractZipEntries(
    Buffer.from(await dlResp.arrayBuffer()),
    '.json',
    (entryName, contents) => [{ entryName, json: JSON.parse(contents) as Record<string, unknown> }],
    (entryName, error) => {
      console.warn(`Failed to parse JSON ${entryName} from ${artifact.name}:`, error);
    },
  );
}

function findNamedAggEntry(
  entries: ZipJsonEntry[],
  suffix: string,
): Record<string, unknown> | null {
  const named = entries.find((entry) => {
    const basename = entry.entryName.split('/').pop() ?? entry.entryName;
    return basename === `agg_${suffix}.json`;
  });
  return named?.json ?? null;
}

/**
 * Assemble the normalized power block for one gpu_metrics artifact from its
 * same-suffix siblings, cheapest first: the tiny `bmk_*` agg row (Tier 1), and
 * only when that yields no window bounds, the `power_audit_*` bundle (Tier 2).
 * Every step tolerates absence — legacy runs simply get no `power` block.
 */
async function resolveArtifactPower(
  gpuMetricsArtifactName: string,
  artifactsByName: Map<string, GithubArtifact>,
  githubToken: string,
): Promise<GpuArtifactPower | null> {
  const siblings = siblingArtifactNames(gpuMetricsArtifactName);
  if (!siblings) return null;
  const suffix = gpuMetricsArtifactName.slice('gpu_metrics_'.length);
  const sources: string[] = [];

  // Tier 1: bmk_<suffix> (fallback bmk_agentic_<suffix>) — one agg_*.json.
  let fromAgg: ReturnType<typeof powerFromAggRow> | null = null;
  const bmkArtifact = artifactsByName.get(siblings.bmk) ?? artifactsByName.get(siblings.bmkAgentic);
  if (bmkArtifact) {
    const entries = await downloadJsonEntries(bmkArtifact, githubToken);
    if (entries) {
      // bmk_* holds exactly one agg_*.json; tolerate an unnamed single entry.
      const aggRow =
        findNamedAggEntry(entries, suffix) ?? (entries.length === 1 ? entries[0].json : null);
      if (aggRow) {
        fromAgg = powerFromAggRow(aggRow, 'bmk_artifact');
        sources.push(bmkArtifact.name);
      }
    }
  }

  // Tier 2: power_audit_<suffix> bundle — skipped when Tier 1 gave the window.
  let fromSidecar: ReturnType<typeof powerFromValidationSidecar> | null = null;
  const auditArtifact = artifactsByName.get(siblings.powerAudit);
  if (auditArtifact && !fromAgg?.window) {
    const entries = await downloadJsonEntries(auditArtifact, githubToken);
    if (entries) {
      const sidecar = selectValidationEntry(entries, suffix);
      if (sidecar) fromSidecar = powerFromValidationSidecar(sidecar);
      if (!fromAgg) {
        const aggRow = findNamedAggEntry(entries, suffix);
        if (aggRow) fromAgg = powerFromAggRow(aggRow, 'power_audit_agg');
      }
      if (sidecar || fromAgg?.published?.source === 'power_audit_agg') {
        sources.push(auditArtifact.name);
      }
    }
  }

  return mergeArtifactPower(fromAgg, fromSidecar, sources);
}

async function fetchGpuMetrics(runId: string) {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  const gpuArtifacts = artifacts.filter((a) => a.name.startsWith('gpu_metrics'));
  if (gpuArtifacts.length === 0) throw new Error('No gpu_metrics artifacts found for this run');

  // Sibling lookup for power sidecars; same-name re-uploads keep only the
  // newest (highest id), mirroring unofficial-run's per-config selection.
  const artifactsByName = new Map<string, (typeof artifacts)[number]>();
  for (const artifact of artifacts) {
    const prev = artifactsByName.get(artifact.name);
    if (!prev || artifact.id > prev.id) artifactsByName.set(artifact.name, artifact);
  }

  const parsedArtifacts: {
    name: string;
    data: ReturnType<typeof parseCsvData>;
    power?: GpuArtifactPower;
  }[] = [];
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

    const rows = extractZipEntries(
      Buffer.from(await dlResp.arrayBuffer()),
      '.csv',
      (_entryName, contents) => parseCsvData(contents),
      (entryName, error) => {
        console.warn(`Failed to parse CSV ${entryName} from ${artifact.name}:`, error);
      },
    );
    if (rows.length > 0) parsedArtifacts.push({ name: artifact.name, data: rows });
  }

  if (parsedArtifacts.length === 0) throw new Error('No Chip metrics data found in artifacts');

  // Additive enrichment: a sidecar failure must never break the CSV view.
  for (const parsed of parsedArtifacts) {
    try {
      const power = await resolveArtifactPower(parsed.name, artifactsByName, githubToken);
      if (power) parsed.power = power;
    } catch (error) {
      console.warn(`Failed to resolve power sidecars for ${parsed.name}:`, error);
    }
  }

  return {
    runInfo: normalizeGithubRunInfo(run),
    artifacts: parsedArtifacts,
  };
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId');

  if (!runId || !/^\d+$/u.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric workflow run ID' }, { status: 400 });
  }

  try {
    const data = await fetchGpuMetrics(runId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 },
    );
  }
}
