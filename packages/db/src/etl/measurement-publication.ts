import fs from 'node:fs';
import path from 'node:path';
import {
  verifyMeasurementSnapshot,
  mapReceiptPointRows,
  type MeasurementReceipt,
  type ReceiptPoint,
} from '../lib/measurement-receipt';
import { createSkipTracker } from './skip-tracker';
import { mapEvalSamples, projectEvalSamples } from './eval-samples-mapper';

export interface ExpectedPublishedPoint {
  point: ReceiptPoint;
  metrics: Record<string, number>;
  strictPassed: number | null;
}
export interface PublishedMeasurement extends Record<string, unknown> {
  id: number;
  conc: number;
  metrics: Record<string, number>;
  task?: string;
}
const CONFIG_COLUMNS: Record<string, string> = {
  specMethod: 'spec_method',
  recipeFingerprint: 'recipe_fingerprint',
};

export function expectedPublication(
  receipt: MeasurementReceipt,
  root: string,
): ExpectedPublishedPoint[] {
  verifyMeasurementSnapshot(receipt, root);
  const names = new Map(receipt.artifacts.map((artifact) => [artifact.id, artifact.name]));
  return receipt.points.map((point) => {
    const mapped = mapReceiptPointRows(receipt, root, point).mapped.find(
      (row) =>
        row?.conc === point.concurrency &&
        (point.kind === 'throughput' || ('task' in row && row.task === point.task)),
    )!;
    let strictPassed: number | null = null;
    if (point.kind === 'eval') {
      const text = fs.readFileSync(
        path.join(root, names.get(point.samples_artifact_id!)!, point.samples_path!),
        'utf8',
      );
      strictPassed = projectEvalSamples(mapEvalSamples(text, createSkipTracker())).filter(
        (sample) => sample.passed,
      ).length;
    }
    return {
      point,
      metrics: Object.fromEntries(point.required_metrics.map((key) => [key, mapped.metrics[key]])),
      strictPassed,
    };
  });
}
export function publishedPointMatches(point: ReceiptPoint, row: PublishedMeasurement): boolean {
  return (
    row.conc === point.concurrency &&
    (point.kind === 'throughput' || row.task === point.task) &&
    Object.entries(point.config).every(([key, value]) => row[CONFIG_COLUMNS[key] ?? key] === value)
  );
}
export function verifyPublishedMeasurements(
  expected: readonly ExpectedPublishedPoint[],
  actual: readonly PublishedMeasurement[],
  kind: ReceiptPoint['kind'],
  source: string,
): string[] {
  const errors: string[] = [];
  for (const item of expected.filter((entry) => entry.point.kind === kind)) {
    const rows = actual.filter((row) => publishedPointMatches(item.point, row));
    if (rows.length !== 1) {
      errors.push(`${source}: ${item.point.point_id}: expected one point, found ${rows.length}`);
      continue;
    }
    const row = rows[0];
    const topology = item.point.topology;
    if (
      row.disagg !== false ||
      row.is_multinode !== false ||
      row.decode_tp !== topology.tp ||
      row.decode_ep !== topology.ep ||
      row.num_decode_gpu !== topology.serving_gpus ||
      row.num_prefill_gpu !== topology.serving_gpus
    )
      errors.push(`${source}: ${item.point.point_id}: topology mismatch`);
    for (const [metric, value] of Object.entries(item.metrics))
      if (row.metrics[metric] !== value)
        errors.push(
          `${source}: ${item.point.point_id}: ${metric} differs (${row.metrics[metric]} vs ${value})`,
        );
  }
  return errors;
}
