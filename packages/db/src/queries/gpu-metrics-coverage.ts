export interface GpuMetricsRunCoverage {
  status: 'complete' | 'partial' | 'unknown';
  missingArtifacts: string[];
}

export interface GpuMetricSeriesCoverageRow {
  artifact_name: string;
  file_name: string;
  sample_count: number;
  run_artifact_inventory: unknown;
  series_inventory: unknown;
}

export function gpuMetricsRunCoverage(
  rows: readonly GpuMetricSeriesCoverageRow[],
): GpuMetricsRunCoverage {
  const expectedArtifacts = new Set<string>();
  const actualArtifacts = new Set(rows.map((row) => row.artifact_name));
  let unknown = rows.length === 0;
  let incomplete = false;
  for (const row of rows) {
    const artifacts = row.run_artifact_inventory;
    if (
      !Array.isArray(artifacts) ||
      artifacts.length === 0 ||
      !artifacts.every((name): name is string => typeof name === 'string' && name.length > 0) ||
      !artifacts.includes(row.artifact_name)
    ) {
      unknown = true;
    } else {
      for (const name of artifacts) expectedArtifacts.add(name);
    }
    const inventory = row.series_inventory;
    if (!Array.isArray(inventory) || inventory.length === 0) {
      unknown = true;
      continue;
    }
    let includesSelf = false;
    for (const expected of inventory) {
      if (
        expected === null ||
        typeof expected !== 'object' ||
        !('fileName' in expected) ||
        typeof expected.fileName !== 'string' ||
        !('sampleCount' in expected) ||
        typeof expected.sampleCount !== 'number' ||
        !Number.isSafeInteger(expected.sampleCount) ||
        expected.sampleCount < 0
      ) {
        unknown = true;
        continue;
      }
      includesSelf ||= expected.fileName === row.file_name;
      if (
        !rows.some(
          (stored) =>
            stored.artifact_name === row.artifact_name &&
            stored.file_name === expected.fileName &&
            Number(stored.sample_count) === expected.sampleCount,
        )
      )
        incomplete = true;
    }
    if (!includesSelf) unknown = true;
  }
  const missingArtifacts = [...expectedArtifacts]
    .filter((name) => !actualArtifacts.has(name))
    .sort();
  return {
    status:
      incomplete || missingArtifacts.length > 0 ? 'partial' : unknown ? 'unknown' : 'complete',
    missingArtifacts,
  };
}
