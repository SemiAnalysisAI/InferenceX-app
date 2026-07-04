import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverTraceReplayArtifacts } from './trace-artifact-discovery';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-artifacts-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeTraceFiles(dir: string): void {
  fs.mkdirSync(path.join(dir, 'aiperf_artifacts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'aiperf_artifacts', 'profile_export.jsonl'), '{}\n');
  fs.writeFileSync(path.join(dir, 'aiperf_artifacts', 'server_metrics_export.csv'), 'x,y\n');
  fs.writeFileSync(path.join(dir, 'aiperf_artifacts', 'server_metrics_export.json'), '{}');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('discoverTraceReplayArtifacts', () => {
  it('discovers the existing single-node sibling layout', () => {
    const root = tempDir();
    writeTraceFiles(path.join(root, 'agentic_config-a'));

    const found = discoverTraceReplayArtifacts(root);

    expect(found.get('config-a')).toMatchObject({
      profileJsonl: expect.stringContaining('profile_export.jsonl'),
      serverMetricsCsv: expect.stringContaining('server_metrics_export.csv'),
      serverMetricsJson: expect.stringContaining('server_metrics_export.json'),
    });
  });

  it('extracts and indexes multinode traces by concurrency', () => {
    const root = tempDir();
    const artifactDir = path.join(root, 'multinode_server_logs_config-b');
    const archiveSource = path.join(root, 'archive-source');
    writeTraceFiles(path.join(archiveSource, 'agentic', 'conc_96'));
    writeTraceFiles(path.join(archiveSource, 'agentic', 'conc_128'));
    fs.mkdirSync(artifactDir, { recursive: true });
    execFileSync('tar', [
      '-czf',
      path.join(artifactDir, 'multinode_server_logs.tar.gz'),
      '-C',
      archiveSource,
      '.',
    ]);
    fs.rmSync(archiveSource, { recursive: true, force: true });

    const found = discoverTraceReplayArtifacts(root);

    expect([...found.keys()].toSorted()).toEqual(['config-b|128', 'config-b|96']);
    expect(found.get('config-b|96')?.profileJsonl).toContain(
      'multinode_server_logs/agentic/conc_96/aiperf_artifacts/profile_export.jsonl',
    );
  });
});
