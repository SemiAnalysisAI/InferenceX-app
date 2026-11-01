import { archiveSources, type CIArtifact } from './archive';
import { at, loadBundle, number, rows, text, type Json } from './bundle';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints, videoPoints } from './points';
import { DEFAULT_RESULTS_STATE, resultProjection } from './results';
import { isNativeH3, servingCells } from './serving';
import type { StoredArtifact, StoredSource } from './stored';

function replayArtifact(metadata: Json, size: number): CIArtifact {
  const id = number(at(metadata, 'id'));
  const name = text(at(metadata, 'name'));
  const expired = at(metadata, 'expired');
  const digest = text(at(metadata, 'digest'));
  const runId = number(at(metadata, 'workflow_run', 'id'));
  const headSha = text(at(metadata, 'workflow_run', 'head_sha'));
  if (
    id === null ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !name ||
    typeof expired !== 'boolean' ||
    at(metadata, 'size_in_bytes') !== size ||
    !/^sha256:[a-f0-9]{64}$/u.test(digest) ||
    runId === null ||
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    !/^[a-f0-9]{40}$/u.test(headSha)
  )
    throw new Error(
      'Original GitHub artifact metadata must include matching size, digest and workflow identity',
    );
  return {
    id,
    name,
    expired,
    size_in_bytes: size,
    digest,
    workflow_run: { id: runId, head_sha: headSha },
  };
}

/** The CLI and local development adapter share one verified, HTTP-independent reader. */
export async function readVideoReplay(blob: Blob, metadata: Json, expectedPlanSha256: string) {
  if (!/^[a-f0-9]{64}$/u.test(expectedPlanSha256))
    throw new Error('Expected plan SHA256 is required');
  const artifact = replayArtifact(metadata, blob.size);
  const archive = await archiveSources(blob, artifact);
  const sources: StoredSource[] = [];
  const media = new Map<string, Map<string, Blob>>();
  const errors: string[] = [];
  const cells: {
    source: string;
    cell: string;
    concurrency: number;
    status: Json;
    completion: Json;
    verified: Json;
    powerValid: Json;
    planSha256: Json;
    frameCount: Json;
    caseCount: number;
    distinctPrompts: number;
  }[] = [];
  for (const source of archive) {
    try {
      const bundle = await loadBundle(source.read);
      if (!isNativeH3(bundle.manifest)) throw new Error('Not a native H3 serving bundle');
      const serving = servingCells(bundle);
      if (serving.length === 0) throw new Error('No native serving cells');
      for (const cell of serving) {
        const plan = at(cell.run, 'plan');
        const cases = rows(at(plan, 'cases'));
        const planSha256 = at(cell.run, 'plan_sha256');
        if (planSha256 !== expectedPlanSha256)
          errors.push(`${source.id}/${cell.id}: missing or mismatched expected plan SHA256`);
        cells.push({
          source: source.id,
          cell: cell.id,
          concurrency: cell.concurrency,
          status: at(cell.cell, 'status'),
          completion: at(cell.cell, 'completion'),
          verified: at(cell.cell, 'verified'),
          powerValid: at(cell.power, 'valid'),
          planSha256,
          frameCount: at(plan, 'generation', 'frame_count'),
          caseCount: cases.length,
          distinctPrompts: new Set(cases.map((c) => text(at(c, 'prompt'))).filter(Boolean)).size,
        });
      }
      sources.push({
        id: source.id,
        documents: [...bundle.documents],
        checksums: [...bundle.checksums],
        assets: [],
        texts: [],
      });
      media.set(source.id, new Map([...bundle.files].filter(([path]) => path.endsWith('.mp4'))));
    } catch (error) {
      errors.push(`${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const runId = String(artifact.workflow_run!.id);
  const stored: StoredArtifact = { storageVersion: 1, runId, artifact, sources };
  const entry = videoHistoryEntry(stored, null);
  entry.approved = false;
  if (entry.error) errors.push(entry.error);
  for (const source of entry.sources)
    if (source.error) errors.push(`${source.id}: ${source.error}`);
  const pages: VideoHistoryPage[] = [{ schemaVersion: 1, entries: [entry], nextPage: null }];
  const official = videoPoints(pages);
  const named = namedRunPoints(pages, runId);
  const projection = resultProjection(
    official,
    { ...DEFAULT_RESULTS_STATE, unofficialRun: runId },
    named,
  );
  const report = {
    ok: errors.length === 0 && cells.length > 0,
    artifact: metadata,
    expectedPlanSha256,
    errors,
    cells,
    history: {
      approved: entry.approved,
      publishedAt: entry.publishedAt,
      sources: entry.sources.map((source) => ({
        id: source.id,
        sha256: source.sha256,
        sourceSha: source.sourceSha,
        releaseQualified: source.releaseQualified,
        powerVerified: source.powerVerified,
        error: source.error,
        observations: source.observations.map((o) => ({
          cell: o.cell,
          hardware: o.hardware,
          status: o.status,
          frameCount: o.frameCount,
          scheduled: o.scheduled,
          completed: o.completed,
          valid: o.valid,
          failed: o.failed,
          samples: o.samples,
          participating: o.participating,
          allocated: o.allocated,
        })),
      })),
    },
    officialPoints: official.length,
    namedDiagnosticPoints: named.length,
    results: projection.options.workloads.map((workload) => {
      const selected = resultProjection(
        official,
        { ...projection.state, workload: workload.key },
        named,
      );
      return {
        workload: workload.key,
        officialCells: selected.cells.length,
        diagnosticCells: selected.overlayCells.map((c) => ({
          id: c.point.id,
          hardware: c.point.hardwareKey,
          approved: c.point.approved,
          participating: c.point.participating,
          allocated: c.point.allocated,
          cost: c.cost,
        })),
      };
    }),
  };
  return { report, stored, media };
}

/** Offline reader acceptance only; a local ZIP cannot establish publication approval. */
export async function replayVideoArtifact(blob: Blob, metadata: Json, expectedPlanSha256: string) {
  const replay = await readVideoReplay(blob, metadata, expectedPlanSha256);
  return replay.report;
}
