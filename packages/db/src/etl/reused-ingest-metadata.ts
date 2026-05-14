import fs from 'fs';
import path from 'path';

export interface ReusedIngestMetadata {
  sourceRunId: string;
  sourceRunAttempt: number;
  sourceRunUrl?: string;
  triggerRunId?: string;
  triggerRunAttempt?: number;
  metadataPath: string;
}

export function flattenReusedIngestArtifactBundle(rootDir: string): string[] {
  const bundleDir = path.join(rootDir, 'reused-ingest-artifacts');
  if (!fs.existsSync(bundleDir)) return [];

  const moved: string[] = [];
  for (const name of fs.readdirSync(bundleDir)) {
    const source = path.join(bundleDir, name);
    const dest = path.join(rootDir, name);
    if (fs.existsSync(dest)) {
      throw new Error(`Cannot flatten reused artifact '${name}'; destination already exists`);
    }
    fs.renameSync(source, dest);
    moved.push(name);
  }
  fs.rmdirSync(bundleDir);
  return moved;
}

function parsePositiveInteger(value: unknown, fieldName: string, filePath: string): number {
  const asString =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  if (!/^\d+$/u.test(asString)) {
    throw new Error(`Invalid ${fieldName} in ${filePath}: expected a positive integer`);
  }

  const parsed = Number.parseInt(asString, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName} in ${filePath}: expected a positive integer`);
  }
  return parsed;
}

function optionalPositiveInteger(
  value: unknown,
  fieldName: string,
  filePath: string,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return parsePositiveInteger(value, fieldName, filePath);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readReusedIngestMetadata(rootDir: string): ReusedIngestMetadata | null {
  const candidatePaths = [
    path.join(rootDir, 'reused-ingest-metadata', 'reuse_source_run.json'),
    path.join(
      rootDir,
      'reused-ingest-artifacts',
      'reused-ingest-metadata',
      'reuse_source_run.json',
    ),
  ];
  const metadataPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!metadataPath) return null;

  const raw = fs.readFileSync(metadataPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid reuse metadata in ${metadataPath}: expected a JSON object`);
  }

  const data = parsed as Record<string, unknown>;
  const sourceRunId = String(
    parsePositiveInteger(data.source_run_id, 'source_run_id', metadataPath),
  );
  const sourceRunAttempt = parsePositiveInteger(
    data.source_run_attempt ?? '1',
    'source_run_attempt',
    metadataPath,
  );

  return {
    sourceRunId,
    sourceRunAttempt,
    sourceRunUrl: readString(data.source_run_url),
    triggerRunId: optionalPositiveInteger(
      data.ingest_run_id,
      'ingest_run_id',
      metadataPath,
    )?.toString(),
    triggerRunAttempt: optionalPositiveInteger(
      data.ingest_run_attempt,
      'ingest_run_attempt',
      metadataPath,
    ),
    metadataPath,
  };
}
