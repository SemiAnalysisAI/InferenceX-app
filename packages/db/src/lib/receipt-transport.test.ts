import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareReceiptTransport } from './receipt-transport';
import { sha256 } from './artifact-archive';
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const roots: string[] = [];
function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-transport-'));
  roots.push(value);
  return value;
}
afterEach(() => {
  vi.resetAllMocks();
  roots.splice(0).forEach((value) => fs.rmSync(value, { recursive: true, force: true }));
});
const raw = fs.readFileSync(new URL('fixtures/measurement-receipt/receipt.json', import.meta.url));
const zip = new AdmZip();
zip.addFile('receipt.json', raw);
const archive = Buffer.from(zip.toBuffer());
const env = {
  INGEST_REPO: 'org/repo',
  SOURCE_RUN_ID: '100',
  RECEIPT_REQUIRED: 'false',
  RECEIPT_ARTIFACT_ID: '301',
  RECEIPT_ARTIFACT_SHA256: sha256(archive),
  RECEIPT_SHA256: '00465d715d63cd4df2f55d6662eb4b10982330f14e8e0d35872b88efb2e619d6',
  RECEIPT_ISSUER_RUN_ID: '200',
  RECEIPT_ISSUER_SHA: 'd'.repeat(40),
  ALLOWED_RECEIPT_ISSUER_SHAS: 'd'.repeat(40),
  ALLOWED_RECEIPT_ISSUER_WORKFLOW: '.github/workflows/issue-receipt.yml',
};
function api(endpoint: string) {
  if (endpoint.endsWith('/runs/100/artifacts'))
    return JSON.stringify([
      { artifacts: [{ id: 101, name: 'native-execution-point', created_at: '' }] },
    ]);
  if (endpoint.endsWith('/runs/200'))
    return JSON.stringify({
      id: 200,
      head_sha: 'd'.repeat(40),
      path: '.github/workflows/issue-receipt.yml',
      status: 'completed',
      conclusion: 'success',
    });
  if (endpoint.endsWith('/301/zip')) return archive;
  if (endpoint.endsWith('/artifacts/301'))
    return JSON.stringify({
      id: 301,
      name: 'receipt-display',
      workflow_run: { id: 200 },
      expired: false,
      digest: `sha256:${sha256(archive)}`,
      archive_download_url: 'https://api.github.com/repos/org/repo/actions/artifacts/301/zip',
    });
  throw new Error('unrequested endpoint');
}
it('enforces native capability from API inventory and accepts only the pinned successful issuer', () => {
  vi.mocked(execFileSync).mockImplementation((_command, args) => api((args as string[])[1]));
  expect(() => prepareReceiptTransport({ ...env, RECEIPT_ARTIFACT_ID: '' }, root())).toThrow(
    'Required source receipt',
  );
  const values = prepareReceiptTransport(env, root());
  expect(values.INGEST_RECEIPT_REQUIRED).toBe('1');
  expect(JSON.parse(fs.readFileSync(values.INGEST_RECEIPT_PATH, 'utf8')).source_attempt).toBe(2);
  expect(() =>
    prepareReceiptTransport({ ...env, RECEIPT_ISSUER_SHA: 'f'.repeat(40) }, root()),
  ).toThrow('not deployed/allowed');
});
it('does not promote a same-named candidate workflow artifact to issuer authority', () => {
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    const endpoint = (args as string[])[1];
    if (endpoint.endsWith('/runs/200'))
      return JSON.stringify({
        id: 200,
        head_sha: 'd'.repeat(40),
        path: '.github/workflows/candidate.yml',
        status: 'completed',
        conclusion: 'success',
      });
    return api(endpoint);
  });
  const destination = root();
  expect(() => prepareReceiptTransport(env, destination)).toThrow('successful allowed workflow');
  expect(fs.readdirSync(destination)).toEqual([]);
});
it('keeps explicit legacy behavior only when API inventory does not identify the native lane', () => {
  vi.mocked(execFileSync).mockReturnValue('[{"artifacts":[]}]');
  expect(
    prepareReceiptTransport(
      { INGEST_REPO: 'org/repo', SOURCE_RUN_ID: '100', RECEIPT_REQUIRED: 'false' },
      root(),
    ),
  ).toEqual({ INGEST_RECEIPT_REQUIRED: '0' });
});
