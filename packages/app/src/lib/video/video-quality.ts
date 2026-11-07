import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { GITHUB_REPO_FULL } from '@semianalysisai/inferencex-constants';
import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import type { CIArtifact } from '@/components/video-benchmark/archive';
import { at, rows, safePath, sha256, text, type Json } from '@/components/video-benchmark/bundle';
import { verifiedDiagnosticPairs } from '@/components/video-benchmark/diagnostic-quality';
import {
  verifiedQuality,
  verifiedQualityFiles,
  type ArtifactQuality,
  type ClipQuality,
} from '@/components/video-benchmark/reference-quality';
import type { StoredArtifact, StoredQuality } from '@/components/video-benchmark/stored';
import { artifactFiles, type GithubRead } from './video-live-run';
import { readStoredQuality, storeReferenceMedia, storeVideoQuality } from './video-storage';

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

const QUALITY_WORKFLOW = '.github/workflows/video-quality.yml';
const qualityFile = (path: string) => path === 'SHA256SUMS' || /^[\w-]+\.json$/u.test(path);

async function verifiedReference(
  descriptor: Json,
  reference: ClipQuality['reference'],
  blob: Blob,
) {
  const listed = rows(at(descriptor, 'cases')).find(
    (item) => at(item, 'case_id') === reference.case_id,
  );
  if (blob.size !== at(listed ?? null, 'bytes') || (await sha256(blob)) !== reference.media_sha256)
    throw new Error('Reference media does not match its descriptor');
  return blob;
}

/** A `head_branch` is only a ref name; the run's commit must also be main or one of its ancestors. */
async function onMain(sha: unknown, github: GithubRead, signal: AbortSignal) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha)) return false;
  const response = await github(`/compare/${sha}...main`, signal);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Quality workflow commit unavailable');
  const { status } = await response.json();
  return status === 'identical' || status === 'ahead';
}

/**
 * The newest unexpired `h3-quality-<run>-<attempt>` artifact uploaded by a video-quality.yml
 * workflow_run or dispatch of a main commit of the public repository. Trust comes from the
 * uploading workflow run, never from the scorer revision recorded inside the attachment.
 */
export async function trustedQualityArtifact(
  runId: string,
  attempt: string,
  github: GithubRead,
  signal: AbortSignal,
): Promise<CIArtifact | null> {
  const name = `h3-quality-${runId}-${attempt}`;
  const listing = await github(`/actions/artifacts?name=${name}&per_page=100`, signal);
  if (!listing.ok) throw new Error('Quality artifact listing unavailable');
  const { artifacts = [] }: { artifacts?: CIArtifact[] } = await listing.json();
  const candidates = artifacts
    .filter((item) => item.name === name && !item.expired && item.workflow_run?.id)
    .toSorted((a, b) => b.id - a.id);
  for (const artifact of candidates) {
    const response = await github(`/actions/runs/${artifact.workflow_run!.id}`, signal);
    if (!response.ok) throw new Error('Quality workflow run unavailable');
    const run = await response.json();
    if (
      run.path === QUALITY_WORKFLOW &&
      (run.event === 'workflow_run' || run.event === 'workflow_dispatch') &&
      run.head_branch === 'main' &&
      run.repository?.full_name === GITHUB_REPO_FULL &&
      run.head_repository?.full_name === GITHUB_REPO_FULL &&
      (await onMain(run.head_sha, github, signal))
    )
      return artifact;
  }
  return null;
}

/** Pairs and unscored clips are judgments; an unreadable bundle is a failure to judge. */
const judged = (quality: ArtifactQuality) =>
  quality.pairs.length > 0 || quality.unscored.length > 0;

/**
 * One result artifact's verified share of a trusted quality artifact. Its own attempt comes
 * first; a later attempt's artifact also scores earlier bundles that were not rerun, which a
 * backfill dispatched only for the run's latest attempt relies on.
 */
export async function readTrustedQuality(
  saved: StoredArtifact,
  github: GithubRead,
  signal: AbortSignal,
): Promise<{ quality: StoredQuality; descriptor: Json } | null> {
  const own = Number(videoArtifactIdentity(saved.artifact.name)?.attempt);
  if (!Number.isSafeInteger(own) || own < 1) return null;
  let latest = own;
  let unreadable: Awaited<ReturnType<typeof attemptQuality>> = null;
  for (let attempt = own; attempt <= latest; attempt += 1) {
    const found = await attemptQuality(saved, String(attempt), github, signal);
    if (found && judged(found.quality)) return found;
    unreadable ??= found;
    if (attempt === own) {
      const response = await github(`/actions/runs/${saved.runId}`, signal);
      if (!response.ok) throw new Error('Video run unavailable');
      const { run_attempt: runAttempt } = await response.json();
      if (Number.isSafeInteger(runAttempt)) latest = runAttempt;
    }
  }
  return unreadable;
}

async function attemptQuality(
  saved: StoredArtifact,
  attempt: string,
  github: GithubRead,
  signal: AbortSignal,
): Promise<{ quality: StoredQuality; descriptor: Json } | null> {
  const artifact = await trustedQualityArtifact(saved.runId, attempt, github, signal);
  if (!artifact) return null;
  const files = await artifactFiles(artifact, github, signal, qualityFile);
  const { attachment, descriptor, attachmentSha256 } = await verifiedQualityFiles((name) => {
    const bytes = files.get(name);
    return bytes && new Blob([new Uint8Array(bytes)]);
  });
  const quality = verifiedQuality(attachment, descriptor, saved, attachmentSha256);
  // An attachment that never mentions this artifact has nothing to attach.
  if (!judged(quality) && !quality.unreadable) return null;
  return {
    descriptor,
    quality: {
      version: 1,
      runId: saved.runId,
      artifactId: saved.artifact.id,
      source: {
        artifactId: artifact.id,
        name: artifact.name,
        workflowRunId: artifact.workflow_run!.id,
      },
      ...quality,
    },
  };
}

/**
 * Attaches a published artifact's trusted quality once. Reference MP4s are stored
 * content-addressed after matching the descriptor's SHA256 and size, then the attachment.
 * A stored attachment is never replaced, so a republish converges without reading GitHub.
 * An unreadable-only share is not stored, so a later successful score can still attach.
 */
export async function publishVideoQuality(
  saved: StoredArtifact,
  github: GithubRead,
  signal: AbortSignal,
): Promise<StoredQuality | null> {
  const existing = await readStoredQuality(saved.runId, saved.artifact);
  if (existing) return existing;
  const found = await readTrustedQuality(saved, github, signal);
  if (!found || !judged(found.quality)) return null;
  const repository = text(at(found.descriptor, 'release', 'repository'));
  const tag = text(at(found.descriptor, 'release', 'tag'));
  if (repository !== GITHUB_REPO_FULL || !/^[\w.-]+$/u.test(tag))
    throw new Error('Reference release is not in the public H3 repository');
  const urls = new Map<string, string>();
  for (const { reference } of found.quality.pairs) {
    if (urls.has(reference.media_sha256)) continue;
    const url = await storeReferenceMedia(
      reference.media_sha256,
      reference.media_path,
      async () => {
        const response = await fetch(
          `https://github.com/${repository}/releases/download/${tag}/${reference.media_path}`,
          { signal },
        );
        if (!response.ok) throw new Error('Reference media unavailable');
        return verifiedReference(found.descriptor, reference, await response.blob());
      },
      signal,
    );
    urls.set(reference.media_sha256, url);
  }
  return storeVideoQuality(
    saved.artifact,
    {
      ...found.quality,
      pairs: found.quality.pairs.map((pair) => ({
        ...pair,
        reference: { ...pair.reference, url: urls.get(pair.reference.media_sha256)! },
      })),
    },
    signal,
  );
}

const LIVE_QUALITY_TTL_MS = 300_000;
const LIVE_QUALITY_LIMIT = 32;
const liveQuality = new Map<string, { expires: number; read: Promise<StoredQuality | null> }>();

/**
 * Trusted quality of an unstored run for public live reads. Hits and misses are reused briefly so
 * repeated views do not spend the GitHub token; a newly uploaded artifact appears after the TTL.
 */
export function liveTrustedQuality(
  saved: StoredArtifact,
  github: GithubRead,
  signal: AbortSignal,
): Promise<StoredQuality | null> {
  const key = `${saved.runId}:${saved.artifact.id}`;
  const cached = liveQuality.get(key);
  if (cached && cached.expires > Date.now()) return cached.read;
  liveQuality.delete(key);
  while (liveQuality.size >= LIVE_QUALITY_LIMIT)
    liveQuality.delete(liveQuality.keys().next().value!);
  const read = readTrustedQuality(saved, github, signal).then((found) => found?.quality ?? null);
  liveQuality.set(key, { expires: Date.now() + LIVE_QUALITY_TTL_MS, read });
  read.catch(() => {
    if (liveQuality.get(key)?.read === read) liveQuality.delete(key);
  });
  return read;
}

/**
 * Development replay of a downloaded h3-quality directory and the reference release MP4s,
 * verified like publication. Private local paths stop here.
 */
export async function readLocalVideoQuality(config: Json, artifacts: StoredArtifact[]) {
  const root = text(at(config, 'path'));
  const references = text(at(config, 'references'));
  if (!isAbsolute(root) || !isAbsolute(references))
    throw new Error('Quality replay needs absolute quality and reference directories');
  const files = new Map<string, Blob>();
  for (const name of await readdir(root))
    if (qualityFile(name))
      files.set(name, new Blob([new Uint8Array(await readFile(join(root, name)))]));
  const { attachment, descriptor, attachmentSha256 } = await verifiedQualityFiles((name) =>
    files.get(name),
  );
  const qualities: ArtifactQuality[] = artifacts.map((saved) =>
    verifiedQuality(attachment, descriptor, saved, attachmentSha256),
  );
  const media = new Map<string, Blob>();
  for (const { reference } of qualities.flatMap((quality) => quality.pairs))
    if (!media.has(reference.media_sha256))
      media.set(
        reference.media_sha256,
        await verifiedReference(
          descriptor,
          reference,
          new Blob([new Uint8Array(await readFile(join(references, reference.media_path)))]),
        ),
      );
  return { qualities, media };
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
