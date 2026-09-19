import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { sha256 } from './artifact-archive';
import {
  parseMeasurementReceipt,
  receiptFromEnvironment,
  verifyMeasurementSnapshot,
  publicationFromEnvironment,
} from './measurement-receipt';
const fixture = new URL('fixtures/measurement-receipt/', import.meta.url);
const raw = fs.readFileSync(new URL('receipt.json', fixture));
const expectedDigest = '00465d715d63cd4df2f55d6662eb4b10982330f14e8e0d35872b88efb2e619d6';
const issuerSha = 'd'.repeat(40);
const roots: string[] = [];
function copy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-'));
  roots.push(root);
  fs.cpSync(fixture, root, { recursive: true });
  return root;
}
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })),
);
it('reads a Python-sealed snapshot and verifies both mapped families and complete sample coverage', () => {
  const receipt = parseMeasurementReceipt(raw, expectedDigest, issuerSha);
  expect(receipt.receipt_id).toBe(
    '2e12626c30ec11cf1738c7541a36444af53c29bad4f59f927930618e298e7a01',
  );
  expect(
    receipt.points.map((point) => [point.kind, point.concurrency, point.source_attempt]),
  ).toEqual([
    ['throughput', 1, 1],
    ['eval', 28, 1],
  ]);
  const root = copy();
  expect(() => verifyMeasurementSnapshot(receipt, root)).not.toThrow();
  const row = JSON.parse(fs.readFileSync(path.join(root, 'bmk_pilot/agg.json'), 'utf8'));
  row[0].output_tput_tps = 999;
  fs.writeFileSync(path.join(root, 'bmk_pilot/agg.json'), JSON.stringify(row));
  expect(() => verifyMeasurementSnapshot(receipt, root)).toThrow('Changed receipt member');
});
it('rejects missing required receipt, unsupported contracts and untrusted issuers', () => {
  expect(() => receiptFromEnvironment({ INGEST_RECEIPT_REQUIRED: '1' })).toThrow(
    'Required measurement receipt missing',
  );
  expect(receiptFromEnvironment({})).toBeNull();
  expect(() => parseMeasurementReceipt(raw, expectedDigest, 'f'.repeat(40))).toThrow('Untrusted');
  const value = JSON.parse(raw.toString());
  value.version = 2;
  const changed = Buffer.from(JSON.stringify(value));
  expect(() => parseMeasurementReceipt(changed, sha256(changed), issuerSha)).toThrow('Unsupported');
});
it.each([
  'duplicate',
  'wrong-topology',
  'missing-metric',
  'wrong-model',
  'filter-gap',
  'wrong-execution',
])('rejects self-consistent but semantically invalid %s artifacts', (kind) => {
  const receipt = parseMeasurementReceipt(raw, expectedDigest, issuerSha);
  const root = copy();
  const artifact = receipt.artifacts[kind === 'filter-gap' ? 1 : 0];
  const name =
    kind === 'filter-gap'
      ? 'samples_gsm8k.jsonl'
      : kind === 'wrong-execution'
        ? 'execution.json'
        : 'agg.json';
  const file = path.join(root, artifact.name, name);
  let contents: string;
  if (kind === 'filter-gap')
    contents = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).join('\n');
  else {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (kind === 'duplicate') value.push(value[0]);
    if (kind === 'wrong-topology') value[0].tp = 4;
    if (kind === 'missing-metric') delete value[0].output_tput_tps;
    if (kind === 'wrong-model') value[0].infmax_model_prefix = 'glm5';
    if (kind === 'wrong-execution') value.native_receipt.state = 'CANCELLED';
    contents = JSON.stringify(value);
  }
  fs.writeFileSync(file, contents);
  const member = artifact.members.find((entry) => entry.path === name)!;
  member.sha256 = sha256(contents);
  member.size = Buffer.byteLength(contents);
  expect(() => verifyMeasurementSnapshot(receipt, root)).toThrow();
});
it('requires a later, immutable publication record when source and merge differ', () => {
  const receipt = parseMeasurementReceipt(raw, expectedDigest, issuerSha);
  expect(publicationFromEnvironment(receipt, '100', {})).toBeNull();
  expect(() =>
    publicationFromEnvironment(receipt, '100', { INGEST_PUBLICATION_REQUIRED: '1' }),
  ).toThrow('requires a publication record');
  expect(() => publicationFromEnvironment(receipt, '200', {})).toThrow(
    'requires a publication record',
  );
  const record = {
    kind: 'publication-record',
    version: 1,
    receipt_id: receipt.receipt_id,
    receipt_artifact_id: 301,
    receipt_artifact_sha256: 'a'.repeat(64),
    source_run_id: '100',
    merge_run_id: '200',
    merge_sha: 'e'.repeat(40),
    changelog_artifact_id: 302,
    changelog_artifact_sha256: 'b'.repeat(64),
    ingest_sha: 'f'.repeat(40),
    app_sha: 'c'.repeat(40),
  };
  const file = path.join(copy(), 'publication.json');
  const bytes = JSON.stringify(record);
  fs.writeFileSync(file, bytes);
  const env = {
    INGEST_PUBLICATION_RECORD_PATH: file,
    INGEST_PUBLICATION_RECORD_SHA256: sha256(bytes),
  };
  expect(publicationFromEnvironment(receipt, '200', env)?.receipt_id).toBe(receipt.receipt_id);
  expect(() => publicationFromEnvironment(receipt, '201', env)).toThrow('Invalid/unsupported');
  expect(() =>
    publicationFromEnvironment(receipt, '200', { ...env, GITHUB_SHA: '9'.repeat(40) }),
  ).toThrow('executing app checkout');
});
it('accepts per-job lm-eval results through the real detail mapper without an aggregate collector', () => {
  const receipt = parseMeasurementReceipt(raw, expectedDigest, issuerSha);
  const root = copy();
  const point = receipt.points[1];
  const artifact = receipt.artifacts[1];
  point.normalized_format = 'lm-eval';
  point.metadata_path = 'meta_env.json';
  const old = JSON.parse(
    fs.readFileSync(path.join(root, artifact.name, point.normalized_path), 'utf8'),
  )[0];
  const results = {
    lm_eval_version: '0.4.7',
    results: { gsm8k: { 'exact_match,strict-match': 0.5 } },
    'n-samples': { gsm8k: { effective: 2 } },
  };
  for (const [name, object] of [
    [point.normalized_path, results],
    ['meta_env.json', old],
  ] as const) {
    const value = JSON.stringify(object);
    fs.writeFileSync(path.join(root, artifact.name, name), value);
    const existing = artifact.members.find((member) => member.path === name);
    const member = { path: name, size: Buffer.byteLength(value), sha256: sha256(value) };
    if (existing) Object.assign(existing, member);
    else artifact.members.push(member);
  }
  expect(() => verifyMeasurementSnapshot(receipt, root)).not.toThrow();
  fs.writeFileSync(path.join(root, artifact.name, 'unexpected.json'), '[]');
  expect(() => verifyMeasurementSnapshot(receipt, root)).toThrow('member set differs');
});
