import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanLogText,
  listServerLogFilePaths,
  primaryServerLogFile,
  readServerLogArtifact,
  readServerLogFiles,
  serverLogArtifactRoot,
  serverLogArtifactSuffix,
} from './server-log-artifacts.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-log-artifacts-'));
  roots.push(root);
  return root;
}

/** Write `files` under a scratch `logs/` tree and gzip it to `archivePath`. */
function writeLogsArchive(archivePath: string, files: Record<string, string>): void {
  const staging = tempRoot();
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
    fs.writeFileSync(path.join(staging, name), text);
  }
  execFileSync('tar', ['-czf', archivePath, '-C', staging, '.']);
}

describe('server-log artifact discovery', () => {
  it('recursively keeps .log and .out files with relative paths', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'agentic', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agentic', 'logs', 'router.log'), 'router\u0000\n');
    fs.writeFileSync(path.join(root, 'worker.out'), 'worker\n');
    fs.writeFileSync(path.join(root, 'metrics.json'), '{}');

    expect(listServerLogFilePaths(root).map((file) => file.fileName)).toEqual([
      'agentic/logs/router.log',
      'worker.out',
    ]);
    expect(readServerLogFiles(root)).toEqual([
      { fileName: 'agentic/logs/router.log', logText: 'router\n' },
      { fileName: 'worker.out', logText: 'worker\n' },
    ]);
  });

  it('prefers a nested server.log as the primary stream', () => {
    const files = [
      { fileName: 'benchmark.out', logText: 'benchmark' },
      { fileName: 'results/server.log', logText: 'server' },
    ];
    expect(primaryServerLogFile(files)).toEqual(files[1]);
  });

  it('recognizes single-node and multinode artifact prefixes', () => {
    expect(serverLogArtifactSuffix('server_logs_config-a')).toBe('config-a');
    expect(serverLogArtifactSuffix('multinode_server_logs_config-b')).toBe('config-b');
    expect(serverLogArtifactSuffix('agentic_config-c')).toBeNull();
  });

  it('lists native srt-slurm single-node logs alongside the client logs', () => {
    const artifactDir = tempRoot();
    fs.mkdirSync(path.join(artifactDir, 'results'));
    fs.writeFileSync(path.join(artifactDir, 'results', 'benchmark.log'), 'client\n');
    fs.writeFileSync(path.join(artifactDir, 'srt-setup.log'), 'setup\n');
    writeLogsArchive(path.join(artifactDir, 'srt-single-node-logs.tar.gz'), {
      'logs/host-1_agg_w0.out': 'max_total_num_tokens=2461120\n',
      'logs/agentic/aiperf_artifacts/server_metrics_export.json': '{}',
    });

    const artifact = { artifactName: 'server_logs_config-a', artifactDir };
    const files = readServerLogArtifact(artifact);
    expect(files.map((file) => file.fileName)).toEqual([
      'results/benchmark.log',
      'srt-setup.log',
      'srt-single-node-logs/logs/host-1_agg_w0.out',
    ]);
    // The primary stream is unchanged from the pre-archive layout.
    expect(primaryServerLogFile(files)?.fileName).toBe('results/benchmark.log');
    // A second read reuses the extraction instead of failing on an existing directory.
    expect(readServerLogArtifact(artifact)).toEqual(files);
  });

  it('reads legacy single-node artifacts without an archive unchanged', () => {
    const artifactDir = tempRoot();
    fs.mkdirSync(path.join(artifactDir, 'results'));
    fs.writeFileSync(path.join(artifactDir, 'results', 'server.log'), 'server\n');

    expect(serverLogArtifactRoot(artifactDir, 'server_logs_config-a')).toBe(artifactDir);
    expect(fs.existsSync(path.join(artifactDir, 'srt-single-node-logs'))).toBe(false);
    expect(readServerLogArtifact({ artifactName: 'server_logs_config-a', artifactDir })).toEqual([
      { fileName: 'results/server.log', logText: 'server\n' },
    ]);
  });

  it('roots multinode artifacts at their extracted archive', () => {
    const artifactDir = tempRoot();
    writeLogsArchive(path.join(artifactDir, 'multinode_server_logs.tar.gz'), {
      'host-1_decode_w0.out': 'decode\n',
    });

    expect(
      readServerLogArtifact({ artifactName: 'multinode_server_logs_config-b', artifactDir }),
    ).toEqual([{ fileName: 'host-1_decode_w0.out', logText: 'decode\n' }]);
    expect(serverLogArtifactRoot(tempRoot(), 'multinode_server_logs_config-c')).toBeNull();
  });

  it('removes PostgreSQL-incompatible null bytes', () => {
    expect(cleanLogText('a\u0000b')).toBe('ab');
  });
});
