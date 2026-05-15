import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  flattenReusedIngestArtifactBundle,
  readReusedIngestMetadata,
} from './reused-ingest-metadata';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-metadata-test-'));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

describe('readReusedIngestMetadata', () => {
  it('returns null when no reuse metadata exists', () => {
    expect(readReusedIngestMetadata(tempDir())).toBeNull();
  });

  it('reads flattened reuse metadata from the CI artifact layout', () => {
    const root = tempDir();
    const metadataPath = path.join(root, 'reused-ingest-metadata', 'reuse_source_run.json');
    writeJson(metadataPath, {
      source_run_id: '25763435778',
      source_run_attempt: '2',
      source_run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/25763435778',
      ingest_run_id: '25800000000',
      ingest_run_attempt: '1',
    });

    expect(readReusedIngestMetadata(root)).toEqual({
      sourceRunId: '25763435778',
      sourceRunAttempt: 2,
      sourceRunUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/25763435778',
      triggerRunId: '25800000000',
      triggerRunAttempt: 1,
      metadataPath,
    });
  });

  it('reads nested reuse metadata from downloaded reused-ingest-artifacts bundles', () => {
    const root = tempDir();
    const metadataPath = path.join(
      root,
      'reused-ingest-artifacts',
      'reused-ingest-metadata',
      'reuse_source_run.json',
    );
    writeJson(metadataPath, {
      source_run_id: 25763435778,
    });

    expect(readReusedIngestMetadata(root)).toMatchObject({
      sourceRunId: '25763435778',
      sourceRunAttempt: 1,
      metadataPath,
    });
  });

  it('rejects malformed source run ids', () => {
    const root = tempDir();
    writeJson(path.join(root, 'reused-ingest-metadata', 'reuse_source_run.json'), {
      source_run_id: 'not-a-run-id',
    });

    expect(() => readReusedIngestMetadata(root)).toThrow(/source_run_id/u);
  });

  it('rejects malformed trigger run ids', () => {
    const root = tempDir();
    writeJson(path.join(root, 'reused-ingest-metadata', 'reuse_source_run.json'), {
      source_run_id: '25763435778',
      ingest_run_id: 'not-a-run-id',
    });

    expect(() => readReusedIngestMetadata(root)).toThrow(/ingest_run_id/u);
  });
});

describe('flattenReusedIngestArtifactBundle', () => {
  it('leaves normal artifact layouts unchanged', () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'results_bmk'));

    expect(flattenReusedIngestArtifactBundle(root)).toEqual([]);
    expect(fs.existsSync(path.join(root, 'results_bmk'))).toBe(true);
  });

  it('moves nested reused artifact directories to the artifact root', () => {
    const root = tempDir();
    const nestedResults = path.join(root, 'reused-ingest-artifacts', 'results_bmk');
    const nestedMetadata = path.join(
      root,
      'reused-ingest-artifacts',
      'reused-ingest-metadata',
      'reuse_source_run.json',
    );
    fs.mkdirSync(nestedResults, { recursive: true });
    writeJson(nestedMetadata, { source_run_id: '25763435778' });

    expect(flattenReusedIngestArtifactBundle(root).toSorted()).toEqual([
      'results_bmk',
      'reused-ingest-metadata',
    ]);
    expect(fs.existsSync(path.join(root, 'reused-ingest-artifacts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'results_bmk'))).toBe(true);
    expect(readReusedIngestMetadata(root)?.sourceRunId).toBe('25763435778');
  });

  it('rejects flattening when it would overwrite an existing artifact', () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'results_bmk'));
    fs.mkdirSync(path.join(root, 'reused-ingest-artifacts', 'results_bmk'), {
      recursive: true,
    });

    expect(() => flattenReusedIngestArtifactBundle(root)).toThrow(/destination already exists/u);
  });
});
