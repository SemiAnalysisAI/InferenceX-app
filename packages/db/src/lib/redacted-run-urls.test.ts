import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { loadRedactedRunUrls, recordRedactedRunUrls } from './redacted-run-urls';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-redacted-urls-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const run = (id: string) => ({
  github_run_id: id,
  run_attempt: 1,
  html_url: `https://github.com/example-org/private-repo/actions/runs/${id}`,
});

describe('recordRedactedRunUrls', () => {
  it('leaves an existing, wider-permission map owner-only', () => {
    const file = path.join(dir, 'existing.jsonl');
    fs.writeFileSync(file, '', { mode: 0o644 });
    fs.chmodSync(file, 0o644);

    recordRedactedRunUrls(file, [run('101')]);

    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, 'utf8')).toBe(`${JSON.stringify(run('101'))}\n`);
  });
});

describe('loadRedactedRunUrls', () => {
  it('reads every map in the directory', () => {
    recordRedactedRunUrls(path.join(dir, 'a.jsonl'), [run('101')]);
    recordRedactedRunUrls(path.join(dir, 'b.jsonl'), [run('102'), run('103')]);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a map');

    expect(loadRedactedRunUrls(dir)).toEqual(
      new Map([
        ['101', run('101').html_url],
        ['102', run('102').html_url],
        ['103', run('103').html_url],
      ]),
    );
  });

  it('is empty without a directory and rejects a malformed line', () => {
    expect(loadRedactedRunUrls(path.join(dir, 'missing'))).toEqual(new Map());
    fs.writeFileSync(path.join(dir, 'bad.jsonl'), '{"github_run_id":"1"}\n');
    expect(() => loadRedactedRunUrls(dir)).toThrow('not a recorded run URL');
  });
});
