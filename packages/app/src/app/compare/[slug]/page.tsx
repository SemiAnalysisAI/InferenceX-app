import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import {
  HW_REGISTRY,
  islOslToSequence,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';
import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getLatestBenchmarks } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/api-cache';
import {
  allCanonicalComparePairs,
  canonicalCompareSlug,
  compareDisplayLabel,
  parseCompareSlug,
  toCompareSlug,
} from '@/lib/compare-slug';

import ComparePageClient from './page-client';

// Dynamic SSR — page reflects latest data from cache, which is purged via
// /api/v1/invalidate (no time-based revalidation needed).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

const DEFAULT_MODEL_DB_KEYS = ['dsr1'];
const DEFAULT_MODEL_DISPLAY = 'DeepSeek-R1-0528';

const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[]) => {
    if (JSON_MODE) return Promise.resolve(jsonProvider.getLatestBenchmarks(dbModelKeys));
    return getLatestBenchmarks(getDb(), dbModelKeys);
  },
  'benchmarks',
  { blobOnly: true },
);

export function generateStaticParams() {
  return allCanonicalComparePairs().map(({ a, b }) => ({ slug: toCompareSlug(a, b) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pair = parseCompareSlug(slug);
  if (!pair) return {};
  const label = compareDisplayLabel(pair.a, pair.b);
  const url = `${SITE_URL}/compare/${canonicalCompareSlug(pair.a, pair.b)}`;
  const description = `Head-to-head GPU inference benchmark comparison: ${label}. Latency, throughput, and cost across LLM workloads.`;
  return {
    title: `${label} Inference Benchmark`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${label} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${label} Inference Benchmark`,
      description,
    },
  };
}

interface PairSummary {
  hardware: string;
  configCount: number;
  bestThroughputPerGpu: number | null;
  bestMedianTtft: number | null;
  bestMedianTpot: number | null;
}

/**
 * Pick the (sequence, precision) combo that maximises the number of distinct
 * (concurrency, framework, spec_method) configs covered by BOTH GPUs in the
 * pair. Falls back to whichever combo has any data for the pair if no overlap
 * exists. Returns nulls if neither GPU has any rows at all (the chart will
 * still render — InferenceProvider falls through to its hard-coded defaults).
 */
function pickPairDefaults(
  rows: Awaited<ReturnType<typeof getCachedBenchmarks>>,
  a: string,
  b: string,
): { sequence: string | null; precision: string | null } {
  const tally = new Map<string, { both: number; either: number }>();
  const seenA = new Map<string, Set<string>>();
  const seenB = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.hardware !== a && row.hardware !== b) continue;
    const seq = islOslToSequence(row.isl, row.osl);
    if (!seq) continue;
    const key = `${seq}|${row.precision}`;
    const variantId = `${row.framework}|${row.spec_method}|${row.conc}`;
    if (row.hardware === a) {
      if (!seenA.has(key)) seenA.set(key, new Set());
      seenA.get(key)!.add(variantId);
    } else {
      if (!seenB.has(key)) seenB.set(key, new Set());
      seenB.get(key)!.add(variantId);
    }
  }
  for (const key of new Set([...seenA.keys(), ...seenB.keys()])) {
    const aSet = seenA.get(key) ?? new Set();
    const bSet = seenB.get(key) ?? new Set();
    let both = 0;
    for (const v of aSet) if (bSet.has(v)) both++;
    tally.set(key, { both, either: aSet.size + bSet.size });
  }
  if (tally.size === 0) return { sequence: null, precision: null };
  // Prefer combos where both GPUs have data; tiebreak on combined coverage.
  const best = [...tally.entries()].toSorted((left, right) => {
    if (left[1].both !== right[1].both) return right[1].both - left[1].both;
    return right[1].either - left[1].either;
  })[0];
  const [seq, prec] = best[0].split('|');
  return { sequence: seq, precision: prec };
}

function summarize(rows: Awaited<ReturnType<typeof getCachedBenchmarks>>, hw: string): PairSummary {
  const hwRows = rows.filter((r) => r.hardware === hw);
  let bestThroughput: number | null = null;
  let bestTtft: number | null = null;
  let bestTpot: number | null = null;
  for (const row of hwRows) {
    const m = row.metrics ?? {};
    const tput = typeof m.tput_per_gpu === 'number' ? m.tput_per_gpu : null;
    const ttft = typeof m.median_ttft === 'number' ? m.median_ttft : null;
    const tpot = typeof m.median_tpot === 'number' ? m.median_tpot : null;
    if (tput !== null && (bestThroughput === null || tput > bestThroughput)) bestThroughput = tput;
    if (ttft !== null && (bestTtft === null || ttft < bestTtft)) bestTtft = ttft;
    if (tpot !== null && (bestTpot === null || tpot < bestTpot)) bestTpot = tpot;
  }
  return {
    hardware: hw,
    configCount: hwRows.length,
    bestThroughputPerGpu: bestThroughput,
    bestMedianTtft: bestTtft,
    bestMedianTpot: bestTpot,
  };
}

function buildJsonLd(
  a: string,
  b: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
) {
  const entryFor = (key: string, summary: PairSummary, position: number) => {
    const meta = HW_REGISTRY[key];
    const label = meta?.label ?? key.toUpperCase();
    const props: { name: string; value: string | number }[] = [];
    if (meta) {
      props.push({ name: 'Vendor', value: meta.vendor });
      props.push({ name: 'Architecture', value: meta.arch });
      props.push({ name: 'TDP (W)', value: meta.tdp });
    }
    if (summary.bestThroughputPerGpu !== null) {
      props.push({
        name: 'Best Throughput per GPU (tok/s)',
        value: Number(summary.bestThroughputPerGpu.toFixed(2)),
      });
    }
    if (summary.bestMedianTtft !== null) {
      props.push({
        name: 'Best Median TTFT (s)',
        value: Number(summary.bestMedianTtft.toFixed(3)),
      });
    }
    if (summary.bestMedianTpot !== null) {
      props.push({
        name: 'Best Median TPOT (s)',
        value: Number(summary.bestMedianTpot.toFixed(4)),
      });
    }
    props.push({ name: 'Benchmark Configurations', value: summary.configCount });
    return {
      '@type': 'ListItem',
      position,
      item: {
        '@type': 'Product',
        name: label,
        brand: { '@type': 'Brand', name: meta?.vendor ?? 'Unknown' },
        category: 'GPU',
        ...(props.length > 0 && {
          additionalProperty: props.map((p) => ({
            '@type': 'PropertyValue',
            name: p.name,
            value: p.value,
          })),
        }),
      },
    };
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${compareDisplayLabel(a, b)} Inference Benchmark`,
    description: `Head-to-head AI inference benchmark comparison of ${HW_REGISTRY[a]?.label ?? a} and ${HW_REGISTRY[b]?.label ?? b} across LLM workloads.`,
    url,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: 2,
    itemListElement: [entryFor(a, summaryA, 1), entryFor(b, summaryB, 2)],
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const pair = parseCompareSlug(slug);
  if (!pair) notFound();

  const canonical = canonicalCompareSlug(pair.a, pair.b);
  if (canonical !== slug) {
    redirect(`/compare/${canonical}`);
  }

  const rows = await getCachedBenchmarks(DEFAULT_MODEL_DB_KEYS);
  const summaryA = summarize(rows, pair.a);
  const summaryB = summarize(rows, pair.b);
  const { sequence: defaultSequence, precision: defaultPrecision } = pickPairDefaults(
    rows,
    pair.a,
    pair.b,
  );

  const url = `${SITE_URL}/compare/${canonical}`;
  const jsonLd = buildJsonLd(pair.a, pair.b, url, summaryA, summaryB);
  const label = compareDisplayLabel(pair.a, pair.b);
  const aMeta = HW_REGISTRY[pair.a];
  const bMeta = HW_REGISTRY[pair.b];

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <ComparePageClient
        a={pair.a}
        b={pair.b}
        label={label}
        defaultModel={DEFAULT_MODEL_DISPLAY}
        defaultSequence={defaultSequence}
        defaultPrecision={defaultPrecision}
        ssrSummary={{
          [pair.a]: summaryA,
          [pair.b]: summaryB,
        }}
        aLabel={aMeta?.label ?? pair.a.toUpperCase()}
        bLabel={bMeta?.label ?? pair.b.toUpperCase()}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
      />
    </>
  );
}
