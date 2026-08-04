import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface TraceReplayArtifactPaths {
  profileJsonl: string | null;
  serverMetricsCsv: string | null;
  serverMetricsJson: string | null;
}

const TRACE_SUBDIRS = ['aiperf_artifacts', 'trace_replay'];

const AGENTIC_PREFIX = /^agentic_/u;
const MULTINODE_PREFIX = /^multinode_server_logs_/u;
const CONC_DIR_PATTERN = /^conc_(?<conc>\d+)$/u;
const SUFFIX_CONC_PATTERN = /(?:^|_)conc(?<conc>\d+)(?:_|$)/u;

function traceFilesIn(dir: string): TraceReplayArtifactPaths | null {
  let profileJsonl: string | null = null;
  let serverMetricsCsv: string | null = null;
  let serverMetricsJson: string | null = null;

  for (const subdir of TRACE_SUBDIRS) {
    const traceDir = path.join(dir, subdir);
    if (!fs.existsSync(traceDir) || !fs.statSync(traceDir).isDirectory()) continue;

    const profilePath = path.join(traceDir, 'profile_export.jsonl');
    const csvPath = path.join(traceDir, 'server_metrics_export.csv');
    const jsonPath = path.join(traceDir, 'server_metrics_export.json');
    if (!profileJsonl && fs.existsSync(profilePath)) profileJsonl = profilePath;
    if (!serverMetricsCsv && fs.existsSync(csvPath)) serverMetricsCsv = csvPath;
    if (!serverMetricsJson && fs.existsSync(jsonPath)) serverMetricsJson = jsonPath;
  }

  if (!profileJsonl && !serverMetricsCsv && !serverMetricsJson) return null;
  return { profileJsonl, serverMetricsCsv, serverMetricsJson };
}

function extractMultinodeArchive(artifactDir: string): string | null {
  const archivePath = path.join(artifactDir, 'multinode_server_logs.tar.gz');
  const extractedDir = path.join(artifactDir, 'multinode_server_logs');

  if (!fs.existsSync(extractedDir) && fs.existsSync(archivePath)) {
    fs.mkdirSync(extractedDir, { recursive: true });
    execFileSync('tar', ['-xzf', archivePath, '-C', extractedDir], { stdio: 'ignore' });
  }

  return fs.existsSync(extractedDir) ? extractedDir : null;
}

/**
 * Discover trace-replay siblings in both artifact layouts:
 *
 * - Single-node: `agentic_<suffix>/aiperf_artifacts/*`
 * - Direct multinode upload: `agentic_<suffix>/conc_<N>/aiperf_artifacts/*`
 * - Multinode: `multinode_server_logs_<suffix>/multinode_server_logs.tar.gz`,
 *   containing `agentic/conc_<N>/aiperf_artifacts/*`
 *
 * Multinode keys include concurrency (`<suffix>|<N>`) because one artifact
 * contains several points, each with a distinct trace payload.
 */
export function discoverTraceReplayArtifacts(
  artifactsDir: string,
): Map<string, TraceReplayArtifactPaths> {
  const discovered = new Map<string, TraceReplayArtifactPaths>();
  if (!fs.existsSync(artifactsDir)) return discovered;

  const entries = fs.readdirSync(artifactsDir);

  // Current multinode jobs upload the same completed aiperf directory twice:
  // directly as `agentic_*`, and inside the server-log tarball. Index complete
  // direct copies first so matching archives do not expand a second GiB-scale
  // copy. Incomplete/legacy direct artifacts still fall through to the archive.
  for (const entry of entries) {
    if (!entry.startsWith('agentic_')) continue;
    const artifactDir = path.join(artifactsDir, entry);
    if (!fs.statSync(artifactDir).isDirectory()) continue;
    const suffix = entry.replace(AGENTIC_PREFIX, '');
    const trace = traceFilesIn(artifactDir);
    if (trace) discovered.set(suffix, trace);

    for (const concEntry of fs.readdirSync(artifactDir)) {
      const match = concEntry.match(CONC_DIR_PATTERN);
      if (!match?.groups?.conc) continue;
      const concTrace = traceFilesIn(path.join(artifactDir, concEntry));
      if (concTrace) discovered.set(`${suffix}|${match.groups.conc}`, concTrace);
    }
  }

  for (const entry of entries) {
    if (!entry.startsWith('multinode_server_logs_')) continue;
    const suffix = entry.replace(MULTINODE_PREFIX, '');
    const suffixConc = suffix.match(SUFFIX_CONC_PATTERN)?.groups?.conc;
    const direct =
      (suffixConc ? discovered.get(`${suffix}|${suffixConc}`) : undefined) ??
      discovered.get(suffix);
    if (suffixConc && direct?.profileJsonl && direct.serverMetricsCsv && direct.serverMetricsJson) {
      continue;
    }

    const artifactDir = path.join(artifactsDir, entry);
    if (!fs.statSync(artifactDir).isDirectory()) continue;
    const extractedDir = extractMultinodeArchive(artifactDir);
    if (!extractedDir) continue;

    const agenticDir = path.join(extractedDir, 'agentic');
    if (!fs.existsSync(agenticDir) || !fs.statSync(agenticDir).isDirectory()) continue;

    for (const concEntry of fs.readdirSync(agenticDir)) {
      const match = concEntry.match(CONC_DIR_PATTERN);
      if (!match?.groups?.conc) continue;
      const trace = traceFilesIn(path.join(agenticDir, concEntry));
      if (trace) discovered.set(`${suffix}|${match.groups.conc}`, trace);
    }
  }

  return discovered;
}
