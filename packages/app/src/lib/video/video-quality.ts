import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { at, rows, safePath, sha256, text, type Json } from '@/components/video-benchmark/bundle';
import { verifiedDiagnosticPairs } from '@/components/video-benchmark/diagnostic-quality';
import { verifiedReferencePairs } from '@/components/video-benchmark/reference-quality';
import type { StoredArtifact } from '@/components/video-benchmark/stored';

async function sealedFile(path: string, expected: string): Promise<Blob> {
  if (!/^[a-f0-9]{64}$/u.test(expected)) throw new Error('Missing quality SHA256');
  const blob = new Blob([new Uint8Array(await readFile(path))]);
  if ((await sha256(blob)) !== expected) throw new Error(`Quality SHA256 mismatch: ${path}`);
  return blob;
}

async function readReceipt(descriptor: Json, filename: string) {
  const receiptPath = text(at(descriptor, 'receipt_path'));
  const receiptSha = text(at(descriptor, 'receipt_sha256'));
  if (!isAbsolute(receiptPath)) throw new Error('Invalid or duplicate reference receipt');
  const root = dirname(receiptPath);
  const sums = await sealedFile(join(root, 'SHA256SUMS'), text(at(descriptor, 'checksums_sha256')));
  const checksums = new Map<string, string>();
  const sumText = await sums.text();
  for (const line of sumText.trim().split('\n')) {
    const match = /^(?<sha>[a-f0-9]{64})  (?<path>.+)$/u.exec(line);
    if (!match) throw new Error('Invalid reference checksum inventory');
    const member = safePath(match.groups!.path);
    if (checksums.has(member)) throw new Error('Duplicate reference checksum member');
    checksums.set(member, match.groups!.sha);
  }
  if (checksums.get(filename) !== receiptSha || receiptPath !== join(root, filename))
    throw new Error('Reference receipt not bound to checksum inventory');
  const receiptFile = await sealedFile(receiptPath, receiptSha);
  const receipt: Json = JSON.parse(await receiptFile.text());
  return { root, receiptSha, receipt, checksums };
}

/** Private local paths stop here; only verified metadata and referenced MP4 bytes leave. */
export async function readLocalVideoQuality(config: Json, artifacts: StoredArtifact[]) {
  const path = text(at(config, 'path'));
  if (!isAbsolute(path)) throw new Error('Quality manifest needs an absolute path');
  const attachmentSha = text(at(config, 'sha256'));
  const attachmentFile = await sealedFile(path, attachmentSha);
  const attachment: Json = JSON.parse(await attachmentFile.text());
  const receipts = new Map<string, Json>();
  const media = new Map<string, Map<string, Blob>>();
  const descriptors = rows(at(attachment, 'references'));
  if (descriptors.length === 0) throw new Error('Quality attachment needs reference receipts');
  for (const descriptor of descriptors) {
    const { root, receiptSha, receipt, checksums } = await readReceipt(
      descriptor,
      'reference.json',
    );
    if (receipts.has(receiptSha)) throw new Error('Duplicate reference receipt');
    receipts.set(receiptSha, receipt);
    const files = new Map<string, Blob>();
    for (const pair of rows(at(attachment, 'pairs'))) {
      const reference = at(pair, 'reference');
      if (at(reference, 'receipt_sha256') !== receiptSha) continue;
      const member = safePath(text(at(reference, 'media_path')));
      const expected = text(at(reference, 'media_sha256'));
      if (!member.endsWith('.mp4') || checksums.get(member) !== expected)
        throw new Error('Reference media not bound to checksum inventory');
      if (!files.has(member)) files.set(member, await sealedFile(join(root, member), expected));
    }
    media.set(receiptSha, files);
  }
  const pairs = verifiedReferencePairs(attachment, receipts, artifacts, attachmentSha);
  return { pairs, media };
}

export async function readLocalVideoDiagnostics(config: Json, artifacts: StoredArtifact[]) {
  const path = text(at(config, 'path'));
  if (!isAbsolute(path)) throw new Error('Diagnostic manifest needs an absolute path');
  const attachmentSha = text(at(config, 'sha256'));
  const attachmentFile = await sealedFile(path, attachmentSha);
  const attachment: Json = JSON.parse(await attachmentFile.text());
  const receipts = new Map<string, Json>();
  const descriptors = new Map<string, string>();
  const media = new Map<string, Map<string, Blob>>();
  for (const pair of rows(at(attachment, 'pairs'))) {
    for (const role of ['candidate', 'reference']) {
      const descriptor = at(pair, role);
      const sha = text(at(descriptor, 'receipt_sha256'));
      const identity = JSON.stringify(descriptor);
      if (descriptors.has(sha)) {
        if (descriptors.get(sha) !== identity) throw new Error('Conflicting diagnostic receipt');
        continue;
      }
      const { root, receipt, checksums } = await readReceipt(descriptor, 'diagnostic.json');
      const member = safePath(text(at(receipt, 'media', 'path')));
      const expected = text(at(receipt, 'media', 'sha256'));
      if (!member.endsWith('.mp4') || checksums.get(member) !== expected)
        throw new Error('Diagnostic media not bound to checksum inventory');
      const blob = await sealedFile(join(root, member), expected);
      for (const evidence of rows(at(receipt, 'evidence'))) {
        const file = safePath(text(at(evidence, 'path')));
        const hash = text(at(evidence, 'sha256'));
        if (checksums.get(file) !== hash)
          throw new Error('Diagnostic evidence not bound to inventory');
        await sealedFile(join(root, file), hash);
      }
      descriptors.set(sha, identity);
      receipts.set(sha, receipt);
      media.set(sha, new Map([[member, blob]]));
    }
  }
  return { pairs: verifiedDiagnosticPairs(attachment, receipts, artifacts, attachmentSha), media };
}
