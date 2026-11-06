import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanLogText,
  listServerLogFilePaths,
  primaryServerLogFile,
  readCappedServerLogFile,
  readServerLogArtifact,
  readServerLogFiles,
  serverLogArtifactRoot,
  serverLogArtifactSuffix,
} from './server-log-artifacts.js';
import { capServerLogText } from './server-log-limits.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-log-artifacts-'));
  roots.push(root);
  return root;
}

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

  it('lists native srt-slurm single-node logs alongside the client logs', async () => {
    const artifactDir = tempRoot();
    fs.mkdirSync(path.join(artifactDir, 'results'));
    fs.writeFileSync(path.join(artifactDir, 'results', 'benchmark.log'), 'client\n');
    fs.writeFileSync(path.join(artifactDir, 'srt-setup.log'), 'setup\n');
    writeLogsArchive(path.join(artifactDir, 'srt-single-node-logs.tar.gz'), {
      'logs/host-1_agg_w0.out': 'max_total_num_tokens=2461120\n',
      'logs/agentic/aiperf_artifacts/server_metrics_export.json': '{}',
    });

    const artifact = { artifactName: 'server_logs_config-a', artifactDir };
    const files = await readServerLogArtifact(artifact);
    expect(files.map((file) => file.fileName)).toEqual([
      'results/benchmark.log',
      'srt-setup.log',
      'srt-single-node-logs/logs/host-1_agg_w0.out',
    ]);
    expect(primaryServerLogFile(files)?.fileName).toBe('results/benchmark.log');
    expect(await readServerLogArtifact(artifact)).toEqual(files);
  });

  it('reads legacy single-node artifacts without an archive unchanged', async () => {
    const artifactDir = tempRoot();
    fs.mkdirSync(path.join(artifactDir, 'results'));
    fs.writeFileSync(path.join(artifactDir, 'results', 'server.log'), 'server\n');

    expect(await serverLogArtifactRoot(artifactDir, 'server_logs_config-a')).toBe(artifactDir);
    expect(fs.existsSync(path.join(artifactDir, 'srt-single-node-logs'))).toBe(false);
    expect(
      await readServerLogArtifact({
        artifactName: 'server_logs_config-a',
        artifactDir,
      }),
    ).toEqual([{ fileName: 'results/server.log', logText: 'server\n' }]);
  });

  it('roots multinode artifacts at their extracted archive', async () => {
    const artifactDir = tempRoot();
    writeLogsArchive(path.join(artifactDir, 'multinode_server_logs.tar.gz'), {
      'host-1_decode_w0.out': 'decode\n',
    });

    expect(
      await readServerLogArtifact({
        artifactName: 'multinode_server_logs_config-b',
        artifactDir,
      }),
    ).toEqual([{ fileName: 'host-1_decode_w0.out', logText: 'decode\n' }]);
    expect(await serverLogArtifactRoot(tempRoot(), 'multinode_server_logs_config-c')).toBeNull();
  });

  it('makes concurrent readers of one archive wait for the whole extraction', async () => {
    const artifactDir = tempRoot();
    const files = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`logs/host-${i}.out`, `${'x'.repeat(100_000)}\n`]),
    );
    writeLogsArchive(path.join(artifactDir, 'multinode_server_logs.tar.gz'), files);

    const extractedDir = path.join(artifactDir, 'multinode_server_logs');
    const sizesSeen = await Promise.all(
      [1, 2, 3].map(async () => {
        const root = await serverLogArtifactRoot(artifactDir, 'multinode_server_logs_config-d');
        expect(root).toBe(extractedDir);
        return listServerLogFilePaths(extractedDir).map((file) => fs.statSync(file.path).size);
      }),
    );
    for (const sizes of sizesSeen) {
      expect(sizes).toEqual(Array.from({ length: 50 }, () => 100_001));
    }
  });

  it('removes PostgreSQL-incompatible null bytes', () => {
    expect(cleanLogText('a\u0000b')).toBe('ab');
  });
});

describe('readCappedServerLogFile', () => {
  it('reads oversized files as only head and tail, matching in-memory truncation', () => {
    const maxBytes = 64 * 1024;
    // Multi-byte characters land on the head/tail cut points at various offsets.
    const text = Array.from({ length: 6000 }, (_, i) => `line ${i} héllo ✓ 𝄞\n`).join('');
    const file = path.join(tempRoot(), 'frontend_0.out');
    fs.writeFileSync(file, text);

    const capped = readCappedServerLogFile(file, maxBytes);
    expect(capped).toEqual(capServerLogText(text, maxBytes));
    expect(capped.truncated).toBe(true);
    expect(capped.text).not.toContain('\uFFFD');
  });

  it('returns files within the limit whole, without null bytes', () => {
    const file = path.join(tempRoot(), 'server.log');
    fs.writeFileSync(file, 'a\u0000b\n');
    expect(readCappedServerLogFile(file, 64 * 1024)).toMatchObject({
      text: 'ab\n',
      truncated: false,
    });
  });
});
