import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareReceiptArtifacts } from './receipt-artifact-preparation';
import { parseMeasurementReceipt } from './measurement-receipt';
import { downloadArtifact } from './github-artifacts';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const fixture = new URL('fixtures/measurement-receipt/', import.meta.url);
const bytes = fs.readFileSync(new URL('receipt.json', fixture));
const roots: string[] = [];
function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-download-'));
  roots.push(value);
  return value;
}
afterEach(() => {
  vi.resetAllMocks();
  roots.splice(0).forEach((value) => fs.rmSync(value, { recursive: true, force: true }));
});
function receipt() {
  return parseMeasurementReceipt(
    bytes,
    '7112fa0765669dc24b375946b136231df3fcff53d756ab1ce56ea6a83914dd4e',
    'd'.repeat(40),
  );
}
it('downloads exact retained IDs and verifies every member before preparing legacy discovery views', () => {
  const accepted = receipt();
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command !== 'gh') throw new Error('unexpected executable');
    const endpoint = (args as string[])[1];
    const id = Number(endpoint.match(/artifacts\/(?<artifactId>\d+)/u)?.[1]);
    const artifact = accepted.artifacts.find((item) => item.id === id);
    if (!artifact) throw new Error('unrequested newer artifact');
    if (endpoint.endsWith('/zip')) return fs.readFileSync(new URL(`${id}.zip`, fixture));
    return JSON.stringify({
      id,
      name: artifact.name,
      expired: false,
      workflow_run: { id: 100 },
      digest: `sha256:${artifact.sha256}`,
      archive_download_url: `https://api.github.com/repos/org/repo/actions/artifacts/${id}/zip`,
    });
  });
  const destination = root();
  prepareReceiptArtifacts(accepted, destination);
  expect(fs.readdirSync(path.join(destination, '.receipt-objects')).toSorted()).toEqual([
    '101',
    '102',
  ]);
  expect(
    JSON.parse(fs.readFileSync(path.join(destination, 'bmk_pilot/agg.json'), 'utf8'))[0]
      .output_tput_tps,
  ).toBe(100);
  expect(
    fs
      .readFileSync(path.join(destination, 'eval_results_all/samples_gsm8k.jsonl'), 'utf8')
      .trim()
      .split('\n'),
  ).toHaveLength(4);
});
it('fails on missing/wrong ownership even if a same-name artifact exists', () => {
  const accepted = receipt();
  vi.mocked(execFileSync).mockReturnValue(
    JSON.stringify({
      id: 999,
      name: 'bmk_pilot',
      workflow_run: { id: 100 },
      digest: `sha256:${accepted.artifacts[0].sha256}`,
    }),
  );
  const destination = root();
  expect(() => prepareReceiptArtifacts(accepted, destination)).toThrow(
    'ownership or digest mismatch',
  );
  expect(fs.existsSync(path.join(destination, 'bmk_pilot'))).toBe(false);
});
it('treats hostile display names as data under numeric roots and never interprets their URL', () => {
  vi.mocked(execFileSync).mockReturnValue(fs.readFileSync(new URL('101.zip', fixture)));
  const destination = root();
  const output = downloadArtifact(
    {
      id: 101,
      name: '$(touch injected)',
      created_at: '',
      archive_download_url: 'https://attacker.invalid/$(touch injected)',
    },
    destination,
    { repo: 'org/repo', isolated: true },
  );
  expect(output).toBe(path.join(destination, '101'));
  expect(fs.readdirSync(destination)).toEqual(['101']);
  expect(JSON.parse(fs.readFileSync(path.join(output, 'agg.json'), 'utf8'))[0].conc).toBe(1);
  expect(vi.mocked(execFileSync).mock.calls[0].slice(0, 2)).toEqual([
    'gh',
    ['api', 'repos/org/repo/actions/artifacts/101/zip'],
  ]);
});
