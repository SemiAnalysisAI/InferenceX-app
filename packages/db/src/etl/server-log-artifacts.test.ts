import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanLogText,
  listServerLogFilePaths,
  primaryServerLogFile,
  readServerLogFiles,
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

  it('removes PostgreSQL-incompatible null bytes', () => {
    expect(cleanLogText('a\u0000b')).toBe('ab');
  });
});
