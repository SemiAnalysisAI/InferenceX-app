import { at, number, text } from './bundle';
import type { CIArtifact } from './archive';
import { storedBundle, storedFidelityBundle, type StoredArtifact } from './stored';
import { servingCells } from './serving';
import { efficiencyValue, latencyValue, tradeoffPoints } from './tradeoff';

export interface VideoHistoryObservation {
  id: string;
  cell: string | null;
  hardware: string;
  concurrency: number | null;
  runtime: string;
  workload: string;
  model: string;
  status: string;
  valid: number | null;
  completed: number | null;
  scheduled: number | null;
  failed: number | null;
  samples: number;
  p50: number | null;
  p90: number | null;
  clipsGpuHour: number | null;
  energyKj: number | null;
}
export interface VideoHistorySource {
  id: string;
  sha256: string | null;
  sourceSha: string;
  hardware: string;
  execution: string;
  observedAt: string | null;
  kind: 'observation' | 'fidelity';
  observations: VideoHistoryObservation[];
  fidelity: string | null;
  calibration: string | null;
  releaseQualified: boolean | null;
  error: string | null;
}
export interface VideoHistoryEntry {
  id: string;
  runId: string;
  artifact: CIArtifact;
  publishedAt: string | null;
  sources: VideoHistorySource[];
  error: string | null;
}
export interface VideoHistoryPage {
  schemaVersion: 1;
  entries: VideoHistoryEntry[];
  nextPage: number | null;
}

/** A read-only projection of published H3 artifacts, not a new benchmark result contract. */
export function videoHistoryEntry(
  saved: StoredArtifact,
  publishedAt: string | null,
): VideoHistoryEntry {
  const sources = saved.sources.map((source): VideoHistorySource => {
    const result: VideoHistorySource = {
      id: source.id,
      sha256: null,
      sourceSha: '',
      hardware: '',
      execution: '',
      observedAt: null,
      kind: source.kind === 'fidelity' ? 'fidelity' : 'observation',
      observations: [],
      fidelity: null,
      calibration: null,
      releaseQualified: null,
      error: null,
    };
    try {
      if (source.kind === 'fidelity') {
        const bundle = storedFidelityBundle(source);
        const comparison = bundle.comparison;
        result.sha256 = bundle.comparisonSha256;
        result.sourceSha = text(at(comparison, 'producer', 'git_commit'));
        result.fidelity = text(at(comparison, 'overall_status')) || null;
        result.calibration = text(at(comparison, 'policy', 'calibration_status')) || null;
        const qualified = at(comparison, 'release_qualified');
        result.releaseQualified = typeof qualified === 'boolean' ? qualified : null;
      } else {
        const bundle = storedBundle(source);
        result.sha256 = bundle.manifestSha256;
        result.sourceSha = text(at(bundle.manifest, 'git_commit'));
        result.observedAt = text(at(bundle.ci, 'started_at')) || null;
        result.hardware = text(at(bundle.ci, 'site', 'gpu_model'));
        result.execution = text(at(bundle.ci, 'phase'));
        result.fidelity = text(at(bundle.result, 'paired_fidelity', 'overall_status')) || null;
        result.calibration =
          text(at(bundle.result, 'policy', 'calibration_status')) ||
          text(at(bundle.report, 'policy', 'calibration_status')) ||
          null;
        const qualified = at(bundle.ci, 'release_qualified');
        result.releaseQualified = typeof qualified === 'boolean' ? qualified : null;
        const cells = servingCells(bundle);
        result.observations = tradeoffPoints({
          bundle,
          exportRun: saved.runId,
          artifact: String(saved.artifact.id),
        }).map((point) => {
          const cell = cells.find((item) => item.id === point.cellId);
          return {
            id: point.id,
            cell: point.cellId ?? null,
            hardware: point.hardware || text(at(bundle.ci, 'site', 'gpu_model')),
            concurrency: point.concurrency,
            runtime: point.revision,
            workload: point.workloadLabel,
            model: point.model,
            status: cell ? text(at(cell.cell, 'status')) : text(at(bundle.ci, 'phase')),
            valid: point.valid,
            completed: point.completed,
            scheduled: point.scheduled ?? number(at(cell?.cell, 'completion', 'scheduled')),
            failed: point.failed ?? number(at(cell?.cell, 'completion', 'failed')),
            samples: point.latencies.length,
            p50: latencyValue(point, 'median'),
            p90: latencyValue(point, 'p90'),
            clipsGpuHour: efficiencyValue(point, 'clipsGpu'),
            energyKj: point.energy === null ? null : point.energy / 1000,
          };
        });
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    return result;
  });
  return {
    id: `${saved.runId}.${saved.artifact.id}`,
    runId: saved.runId,
    artifact: {
      id: saved.artifact.id,
      name: saved.artifact.name,
      expired: saved.artifact.expired,
      size_in_bytes: saved.artifact.size_in_bytes,
      digest: saved.artifact.digest,
      stored: true,
    },
    publishedAt,
    sources,
    error: sources.length === 0 ? 'Published artifact has no sources' : null,
  };
}
