const TRAILING_SLASHES = /\/+$/u;

export interface DatasetProvenance {
  source_type?: unknown;
  loader?: unknown;
  hf_dataset_name?: unknown;
  hf_split?: unknown;
  hf_subset?: unknown;
  num_dataset_entries?: unknown;
}

export function datasetSlugFromBenchmarkRow(row: Record<string, unknown>): string | null {
  const dataset = row.dataset;
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) return null;

  const provenance = dataset as DatasetProvenance;
  if (provenance.source_type !== 'public_dataset') return null;
  if (typeof provenance.hf_dataset_name !== 'string') return null;

  const datasetId = provenance.hf_dataset_name.trim().replace(TRAILING_SLASHES, '');
  if (!datasetId) return null;
  const slug = datasetId.slice(datasetId.lastIndexOf('/') + 1);
  return slug || null;
}
