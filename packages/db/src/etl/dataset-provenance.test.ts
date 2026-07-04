import { describe, expect, it } from 'vitest';

import { datasetSlugFromBenchmarkRow } from './dataset-provenance';

describe('datasetSlugFromBenchmarkRow', () => {
  it('maps aiperf public-dataset provenance to the dashboard dataset slug', () => {
    expect(
      datasetSlugFromBenchmarkRow({
        dataset: {
          source_type: 'public_dataset',
          loader: 'semianalysis_cc_traces_weka_with_subagents',
          hf_dataset_name: 'semianalysisai/cc-traces-weka-062126',
          hf_split: 'train',
          num_dataset_entries: 393,
        },
      }),
    ).toBe('cc-traces-weka-062126');
  });

  it('supports an unnamespaced Hugging Face dataset id', () => {
    expect(
      datasetSlugFromBenchmarkRow({
        dataset: {
          source_type: 'public_dataset',
          hf_dataset_name: 'cc-traces-weka-062126',
        },
      }),
    ).toBe('cc-traces-weka-062126');
  });

  it.each([
    {},
    { dataset: null },
    { dataset: { source_type: 'synthetic', hf_dataset_name: 'owner/data' } },
    { dataset: { source_type: 'public_dataset', hf_dataset_name: '' } },
    { dataset: { source_type: 'public_dataset' } },
  ])('ignores rows without usable public-dataset provenance: %j', (row) => {
    expect(datasetSlugFromBenchmarkRow(row)).toBeNull();
  });
});
