import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { downloadArtifact, listRunArtifacts, type ArtifactMeta } from './github-artifacts';
import { parseMeasurementReceipt } from './measurement-receipt';
import { sha256 } from './artifact-archive';

function required(value: string | undefined, name: string, pattern: RegExp): string {
  if (!value || !pattern.test(value)) throw new Error(`Invalid or missing ${name}`);
  return value;
}
const ID = /^[1-9]\d*$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;

/** Executed from the deployed app checkout. Allowed issuer pins are app configuration, not payload policy. */
export function prepareReceiptTransport(
  env: Record<string, string | undefined>,
  destination: string,
): Record<string, string> {
  if (env.RECEIPT_REQUIRED !== 'true' && env.RECEIPT_REQUIRED !== 'false')
    throw new Error('receipt-required must be explicitly true or false');
  const repo = required(env.INGEST_REPO, 'INGEST_REPO', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
  const sourceRun = required(env.SOURCE_RUN_ID, 'source run ID', ID);
  const nativeRequired = listRunArtifacts(repo, sourceRun).some((artifact) =>
    artifact.name.startsWith('native-execution-'),
  );
  if (!env.RECEIPT_ARTIFACT_ID) {
    if (env.RECEIPT_REQUIRED === 'true' || nativeRequired)
      throw new Error('Required source receipt transport missing');
    return { INGEST_RECEIPT_REQUIRED: '0' };
  }
  const allowed = (env.ALLOWED_RECEIPT_ISSUER_SHAS ?? '').split(',').map((value) => value.trim());
  if (allowed.length === 0 || allowed.some((value) => !SHA.test(value)))
    throw new Error('Missing/invalid deployed issuer revision allowlist');
  const issuerSha = required(env.RECEIPT_ISSUER_SHA, 'issuer revision', SHA);
  if (!allowed.includes(issuerSha))
    throw new Error('Requested issuer revision is not deployed/allowed');
  const issuerWorkflow = required(
    env.ALLOWED_RECEIPT_ISSUER_WORKFLOW,
    'deployed issuer workflow',
    /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u,
  );
  const issuerRun = required(env.RECEIPT_ISSUER_RUN_ID, 'issuer run ID', ID);
  function verifyIssuer(runId: string, revision: string): void {
    if (!allowed.includes(revision)) throw new Error('Publisher revision is not deployed/allowed');
    const run = JSON.parse(
      execFileSync('gh', ['api', `repos/${repo}/actions/runs/${runId}`], { encoding: 'utf8' }),
    );
    if (
      String(run.id) !== runId ||
      run.head_sha !== revision ||
      run.path !== issuerWorkflow ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    )
      throw new Error('Receipt issuer is not the successful allowed workflow execution');
  }
  verifyIssuer(issuerRun, issuerSha);
  fs.mkdirSync(destination, { recursive: true });
  function download(id: string, digest: string, ownerRun = issuerRun): string {
    const metadata = JSON.parse(
      execFileSync('gh', ['api', `repos/${repo}/actions/artifacts/${id}`], { encoding: 'utf8' }),
    ) as ArtifactMeta;
    if (
      String(metadata.id) !== id ||
      String(metadata.workflow_run?.id) !== ownerRun ||
      metadata.expired ||
      metadata.digest !== `sha256:${digest}`
    )
      throw new Error('Receipt transport artifact ownership/digest mismatch');
    return downloadArtifact(metadata, destination, { repo, sha256: digest, isolated: true });
  }
  const id = required(env.RECEIPT_ARTIFACT_ID, 'receipt artifact ID', ID);
  const archiveDigest = required(env.RECEIPT_ARTIFACT_SHA256, 'receipt archive digest', HASH);
  const contentDigest = required(env.RECEIPT_SHA256, 'receipt JSON digest', HASH);
  const directory = download(id, archiveDigest);
  const file = path.join(directory, 'receipt.json');
  const receipt = parseMeasurementReceipt(fs.readFileSync(file), contentDigest, issuerSha);
  if (
    receipt.issuer.repository !== repo ||
    receipt.issuer.run_id !== issuerRun ||
    receipt.repository !== repo ||
    receipt.source_run_id !== env.SOURCE_RUN_ID
  )
    throw new Error('Receipt source or issuer identity differs from requested transport');
  const out: Record<string, string> = {
    INGEST_RECEIPT_REQUIRED: '1',
    INGEST_RECEIPT_PATH: file,
    INGEST_RECEIPT_SHA256: contentDigest,
    INGEST_RECEIPT_ISSUER_SHA: issuerSha,
  };
  if (env.PUBLICATION_ARTIFACT_ID) {
    const publicationId = required(env.PUBLICATION_ARTIFACT_ID, 'publication artifact ID', ID);
    const publicationDigest = required(
      env.PUBLICATION_ARTIFACT_SHA256,
      'publication archive digest',
      HASH,
    );
    const publicationSha = required(env.PUBLICATION_SHA256, 'publication JSON digest', HASH);
    const publicationRun = required(env.PUBLICATION_ISSUER_RUN_ID, 'publication issuer run ID', ID);
    const publicationRevision = required(
      env.PUBLICATION_ISSUER_SHA,
      'publication issuer revision',
      SHA,
    );
    verifyIssuer(publicationRun, publicationRevision);
    const publicationFile = path.join(
      download(publicationId, publicationDigest, publicationRun),
      'publication.json',
    );
    const publicationBytes = fs.readFileSync(publicationFile);
    const publication = JSON.parse(publicationBytes.toString('utf8'));
    if (
      publication.receipt_id !== receipt.receipt_id ||
      publication.receipt_artifact_id !== Number(id) ||
      publication.receipt_artifact_sha256 !== archiveDigest
    )
      throw new Error('Publication refers to a different accepted source receipt');
    if (sha256(publicationBytes) !== publicationSha)
      throw new Error('Publication JSON digest mismatch');
    out.INGEST_PUBLICATION_RECORD_PATH = publicationFile;
    out.INGEST_PUBLICATION_RECORD_SHA256 = publicationSha;
  }
  return out;
}
