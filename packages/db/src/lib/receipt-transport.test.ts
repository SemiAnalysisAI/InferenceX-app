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
  PUBLICATION_REQUIRED: 'false',
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
      head_branch: 'main',
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
    });
  if (endpoint.endsWith('/runs/100/attempts/2'))
    return JSON.stringify({
      id: 100,
      run_attempt: 2,
      head_sha: 'a'.repeat(40),
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
      {
        INGEST_REPO: 'org/repo',
        SOURCE_RUN_ID: '100',
        RECEIPT_REQUIRED: 'false',
        PUBLICATION_REQUIRED: 'true',
      },
      root(),
    ),
  ).toEqual({ INGEST_RECEIPT_REQUIRED: '0' });
});

it('requires later publication for native production even when source and merge IDs are equal', () => {
  vi.mocked(execFileSync).mockImplementation((_command, args) => api((args as string[])[1]));
  expect(() => prepareReceiptTransport({ ...env, PUBLICATION_REQUIRED: 'true' }, root())).toThrow(
    'Native production requires a later publication record',
  );
});

it('carries the immutable later record and mandatory-publication flag into production ingest', () => {
  const publication = {
    kind: 'publication-record',
    version: 1,
    receipt_id: JSON.parse(raw.toString('utf8')).receipt_id,
    receipt_artifact_id: 301,
    receipt_artifact_sha256: sha256(archive),
    source_run_id: '100',
    merge_run_id: '100',
    merge_sha: 'a'.repeat(40),
    changelog_artifact_id: 501,
    changelog_artifact_sha256: 'b'.repeat(64),
    ingest_sha: 'e'.repeat(40),
    app_sha: 'e'.repeat(40),
  };
  const content = Buffer.from(JSON.stringify(publication));
  const publicationZip = new AdmZip();
  publicationZip.addFile('publication.json', content);
  const publicationArchive = Buffer.from(publicationZip.toBuffer());
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    const endpoint = (args as string[])[1];
    if (endpoint.endsWith('/401/zip')) return publicationArchive;
    if (endpoint.endsWith('/artifacts/401'))
      return JSON.stringify({
        id: 401,
        name: 'publication-record',
        workflow_run: { id: 200 },
        expired: false,
        digest: `sha256:${sha256(publicationArchive)}`,
        archive_download_url: 'https://api.github.com/repos/org/repo/actions/artifacts/401/zip',
      });
    return api(endpoint);
  });
  const values = prepareReceiptTransport(
    {
      ...env,
      PUBLICATION_REQUIRED: 'true',
      PUBLICATION_ARTIFACT_ID: '401',
      PUBLICATION_ARTIFACT_SHA256: sha256(publicationArchive),
      PUBLICATION_SHA256: sha256(content),
      PUBLICATION_ISSUER_RUN_ID: '200',
      PUBLICATION_ISSUER_SHA: 'd'.repeat(40),
    },
    root(),
  );
  expect(values.INGEST_PUBLICATION_REQUIRED).toBe('1');
  expect(
    JSON.parse(fs.readFileSync(values.INGEST_PUBLICATION_RECORD_PATH, 'utf8')).merge_run_id,
  ).toBe('100');
});

it.each([
  ['/runs/200', { head_branch: 'candidate' }, 'successful allowed workflow'],
  ['/runs/200', { event: 'pull_request' }, 'successful allowed workflow'],
  ['/runs/100/attempts/2', { head_sha: 'f'.repeat(40) }, 'completed original attempt'],
  ['/runs/100/attempts/2', { run_attempt: 3 }, 'completed original attempt'],
])('rejects wrong issuer branch/event or original attempt: %s %j', (suffix, change, message) => {
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    const endpoint = (args as string[])[1];
    const result = api(endpoint);
    return endpoint.endsWith(suffix)
      ? JSON.stringify({ ...JSON.parse(result as string), ...change })
      : result;
  });
  expect(() => prepareReceiptTransport(env, root())).toThrow(message);
});
