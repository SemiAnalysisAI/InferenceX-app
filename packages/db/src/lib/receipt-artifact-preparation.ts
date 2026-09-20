import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { downloadArtifact, type ArtifactMeta } from './github-artifacts';
import { verifyMeasurementSnapshot, type MeasurementReceipt } from './measurement-receipt';

/** Fetch exact IDs individually, including retained uploads excluded by latest-only APIs. */
export function prepareReceiptArtifacts(receipt: MeasurementReceipt, root: string): void {
  const objects = path.join(root, '.receipt-objects');
  fs.mkdirSync(objects, { recursive: true });
  for (const artifact of receipt.artifacts) {
    const metadata = JSON.parse(
      execFileSync('gh', ['api', `repos/${receipt.repository}/actions/artifacts/${artifact.id}`], {
        encoding: 'utf8',
      }),
    ) as ArtifactMeta;
    if (
      metadata.id !== artifact.id ||
      metadata.name !== artifact.name ||
      metadata.expired ||
      String(metadata.workflow_run?.id) !== artifact.run_id ||
      metadata.digest !== `sha256:${artifact.sha256}`
    )
      throw new Error(`Receipt/API ownership or digest mismatch: ${artifact.id}`);
    downloadArtifact(metadata, objects, {
      repo: receipt.repository,
      sha256: artifact.sha256,
      members: artifact.members,
      isolated: true,
    });
  }
  // Preserve existing consumer discovery while extraction itself is isolated by immutable ID.
  // Names have already been checked as unique, single, non-special path components.
  for (const artifact of receipt.artifacts) {
    const target = path.join(root, artifact.name);
    if (fs.existsSync(target))
      throw new Error(`Refusing artifact view overwrite: ${artifact.name}`);
    fs.cpSync(path.join(objects, String(artifact.id)), target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  verifyMeasurementSnapshot(receipt, root);
}
