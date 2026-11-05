import { describe, expect, it } from 'vitest';

import { AUTHOR_NAME } from '@semianalysisai/inferencex-constants';

import type { InterpolatedResult } from '@/components/calculator/types';
import { getCompareModelBySlug } from '@/lib/compare/compare-slug';
import { buildJsonLd, type PairSummary, type SsrInterpolatedRow } from '@/lib/compare/compare-ssr';
import { buildJsonLdZh } from '@/lib/compare/compare-ssr-zh';
import { buildVariantJsonLd } from '@/lib/compare/compare-variant-ssr';
import { buildVariantJsonLdZh } from '@/lib/compare/compare-variant-ssr-zh';

import { DATASET_LICENSE_URL } from './dataset-jsonld';

const model = getCompareModelBySlug('deepseek-r1')!;
const url = 'https://inferencex.semianalysis.com/compare/x';

function summary(hardware: string): PairSummary {
  return {
    hardware,
    configCount: 3,
    bestThroughputPerGpu: 1000,
    bestMedianTtft: 0.5,
    bestMedianTpot: 0.02,
  };
}

function result(hwKey: string): InterpolatedResult {
  return {
    hwKey,
    resultKey: hwKey,
    value: 1200,
    outputTputValue: 1000,
    inputTputValue: 200,
    cost: 0.5,
    costInput: 0.1,
    costOutput: 0.4,
    tpPerMw: 50_000,
    concurrency: 32,
  } as InterpolatedResult;
}

const rows: SsrInterpolatedRow[] = [
  { target: 20, a: result('b200'), b: result('h100') },
  { target: 50, a: result('b200'), b: null },
];

function datasetNodes(graph: { '@graph': unknown[] }): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const node = value as Record<string, unknown>;
      if (node['@type'] === 'Dataset') nodes.push(node);
      Object.values(node).forEach(visit);
    }
  };
  visit(graph['@graph']);
  return nodes;
}

describe('compare Dataset JSON-LD', () => {
  const graphs = {
    en: buildJsonLd('full', model, 'b200', 'h100', url, summary('b200'), summary('h100'), rows),
    zh: buildJsonLdZh('full', model, 'b200', 'h100', url, summary('b200'), summary('h100'), rows),
    variantEn: buildVariantJsonLd(
      'precision',
      model,
      'b200',
      'FP8',
      'FP4',
      url,
      summary('b200'),
      summary('b200'),
      rows,
    ),
    variantZh: buildVariantJsonLdZh(
      'precision',
      model,
      'b200',
      'FP8',
      'FP4',
      url,
      summary('b200'),
      summary('b200'),
      rows,
    ),
  };

  it.each(Object.entries(graphs))(
    '%s gives every Dataset node, including hasPart rows, description, license and creator',
    (_name, graph) => {
      const nodes = datasetNodes(graph);
      // parent + one per interpolated row
      expect(nodes).toHaveLength(1 + rows.length);
      for (const node of nodes) {
        expect(typeof node.name).toBe('string');
        expect(String(node.description).length).toBeGreaterThanOrEqual(50);
        expect(node.license).toBe(DATASET_LICENSE_URL);
        expect(node.creator).toMatchObject({ '@type': 'Organization', name: AUTHOR_NAME });
      }
      const descriptions = nodes.slice(1).map((node) => node.description);
      expect(new Set(descriptions).size).toBe(rows.length);
    },
  );
});
