import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256 } from './artifact-archive.js';
import {
  RUNNER_SUFFIX_RE,
  dedupeArtifactsByLogicalName,
  downloadArtifact,
} from './github-artifacts.js';

const art = (name: string, created_at: string) => ({
  name,
  archive_download_url: `https://api.github.com/${name}`,
  created_at,
});

describe('RUNNER_SUFFIX_RE', () => {
  it('strips the trailing runner-pool + attempt token', () => {
    expect('bmk_dsr1_conc4_h200-cw_00'.replace(RUNNER_SUFFIX_RE, '')).toBe('bmk_dsr1_conc4');
    expect('bmk_dsr1_conc4_h200-dgxc-slurm_1'.replace(RUNNER_SUFFIX_RE, '')).toBe('bmk_dsr1_conc4');
  });

  it('does not over-match across earlier underscore separators', () => {
    // The (conc, offload) variant tokens must survive — only the final
    // `_<pool>_<digits>` pair is stripped.
    expect('bmk_agentic_glm5_offload_on_b200-nb_2'.replace(RUNNER_SUFFIX_RE, '')).toBe(
      'bmk_agentic_glm5_offload_on',
    );
    expect('server_logs_glm5'.replace(RUNNER_SUFFIX_RE, '')).toBe('server_logs_glm5');
  });
});

describe('dedupeArtifactsByLogicalName', () => {
  it('keeps only the most recent artifact per logical name', () => {
    const deduped = dedupeArtifactsByLogicalName([
      art('bmk_dsr1_conc4_h200-cw_00', '2026-06-01T00:00:00Z'),
      art('bmk_dsr1_conc4_h200-dgxc-slurm_1', '2026-06-02T00:00:00Z'),
      art('bmk_dsr1_conc8_h200-cw_00', '2026-06-01T00:00:00Z'),
    ]);
    expect([...deduped.keys()].toSorted()).toEqual(['bmk_dsr1_conc4', 'bmk_dsr1_conc8']);
    expect(deduped.get('bmk_dsr1_conc4')?.name).toBe('bmk_dsr1_conc4_h200-dgxc-slurm_1');
  });

  it('passes through names without a runner suffix unchanged', () => {
    const deduped = dedupeArtifactsByLogicalName([art('run-stats', '2026-06-01T00:00:00Z')]);
    expect(deduped.get('run-stats')?.name).toBe('run-stats');
  });
});

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function downloadFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-download-test-'));
  roots.push(directory);
  const scratch = path.join(directory, 'scratch');
  fs.mkdirSync(scratch);
  const zip = new AdmZip();
  const payload = Buffer.from('downloaded trace\n');
  zip.addFile('raw/trace.jsonl', payload);
  const bytes = zip.toBuffer();
  const archive = path.join(directory, 'fixture.zip');
  fs.writeFileSync(archive, bytes);
  // Exercise the real process/file-descriptor boundary without a network call.
  // This executable streams its fixture exactly as `gh api .../zip` does.
  fs.writeFileSync(
    path.join(directory, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.ARTIFACT_TEST_CALL, JSON.stringify({
  args: process.argv.slice(2), file: fs.fstatSync(1).isFile(),
}));
if (process.env.ARTIFACT_TEST_FAIL === '1') {
  fs.writeSync(1, Buffer.from('partial ZIP'));
  process.exit(7);
}
const fd = fs.openSync(process.env.ARTIFACT_TEST_ZIP, 'r');
const chunk = Buffer.alloc(32 * 1024);
let count;
while ((count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
  let offset = 0;
  while (offset < count) offset += fs.writeSync(1, chunk, offset, count - offset);
}
fs.closeSync(fd);
`,
    { mode: 0o700 },
  );
  const call = path.join(directory, 'call.json');
  vi.stubEnv('PATH', `${directory}${path.delimiter}${process.env.PATH}`);
  vi.stubEnv('TMPDIR', scratch);
  vi.stubEnv('ARTIFACT_TEST_ZIP', archive);
  vi.stubEnv('ARTIFACT_TEST_CALL', call);
  return {
    scratch,
    call,
    output: path.join(directory, 'downloads'),
    bytes,
    payload,
    artifact: {
      id: 123,
      name: 'benchmark',
      archive_download_url:
        'https://api.github.com/repos/example/project/actions/artifacts/123/zip',
      created_at: '2026-06-01T00:00:00Z',
    },
  };
}

it('streams gh stdout to disk and verifies archive and member digests before extraction', () => {
  const fixture = downloadFixture();
  const destination = downloadArtifact(fixture.artifact, fixture.output, {
    isolated: true,
    sha256: sha256(fixture.bytes),
    members: [
      { path: 'raw/trace.jsonl', size: fixture.payload.length, sha256: sha256(fixture.payload) },
    ],
  });
  expect(destination).toBe(path.join(fixture.output, '123'));
  expect(fs.readFileSync(path.join(destination, 'raw/trace.jsonl'))).toEqual(fixture.payload);
  expect(JSON.parse(fs.readFileSync(fixture.call, 'utf8'))).toEqual({
    args: ['api', 'repos/example/project/actions/artifacts/123/zip'],
    file: true,
  });
  expect(fs.readdirSync(fixture.scratch)).toEqual([]);
});

it('removes partial ZIP downloads after gh fails without creating an extraction root', () => {
  const fixture = downloadFixture();
  vi.stubEnv('ARTIFACT_TEST_FAIL', '1');
  expect(() => downloadArtifact(fixture.artifact, fixture.output)).toThrow();
  expect(fs.existsSync(fixture.output)).toBe(false);
  expect(fs.readdirSync(fixture.scratch)).toEqual([]);
});

it('removes a completed download whose archive digest fails before extracting it', () => {
  const fixture = downloadFixture();
  expect(() =>
    downloadArtifact(fixture.artifact, fixture.output, { sha256: '0'.repeat(64) }),
  ).toThrow('digest mismatch');
  expect(fs.existsSync(fixture.output)).toBe(false);
  expect(fs.readdirSync(fixture.scratch)).toEqual([]);
});
