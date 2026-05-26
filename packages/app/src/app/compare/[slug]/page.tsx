import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  sequenceToIslOsl,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  type BenchmarkRow,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { cachedQuery } from '@/lib/api-cache';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { loadFixture } from '@/lib/test-fixtures';
import { getHardwareKey } from '@/lib/chart-utils';
import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  type CompareModelSlug,
  parseCompareSlug,
} from '@/lib/compare-slug';
import { getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import { JsonLd } from '@/components/json-ld';

import ComparePageClient from './page-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KNOWN_MODELS = new Set([
  'Llama-3.3-70B-Instruct-FP8',
  'Llama-3.1-70B-Instruct-FP8-KV',
  'DeepSeek-R1-0528',
  'gpt-oss-120b',
  'Qwen-3.5-397B-A17B',
  'Kimi-K2.5',
  'MiniMax-M2.5',
  'GLM-5',
  'DeepSeek-V4-Pro',
]);
const KNOWN_SEQUENCES = new Set(['1k/1k', '1k/8k', '8k/1k']);
const KNOWN_PRECISIONS = new Set(['fp4', 'fp8', 'bf16', 'int4', 'nvfp4', 'mxfp4']);

function pickString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[]) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));
    if (JSON_MODE) return Promise.resolve(jsonProvider.getLatestBenchmarks(dbModelKeys));
    return getLatestBenchmarks(getDb(), dbModelKeys);
  },
  'benchmarks',
  { blobOnly: true },
);

export async function generateStaticParams() {
  // Only enumerate (model, pair) combos with benchmark data on both sides.
  // Direct URL hits to non-enumerated combos still render via the dynamic
  // SSR path (with the empty-state fallback).
  const slugs = await getAllComparableCompareSlugs();
  return slugs.map(({ modelSlug, a, b }) => ({ slug: canonicalCompareSlug(modelSlug, a, b) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const url = `${SITE_URL}/compare/${canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b)}`;
  const description = `Head-to-head GPU inference benchmark comparison for ${parsed.model.label}: ${gpuLabel}. Latency, throughput, and cost across LLM workloads.`;
  return {
    title: `${fullLabel} Inference Benchmark`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${fullLabel} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullLabel} Inference Benchmark`,
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

function summarize(rows: BenchmarkRow[], hw: string): PairSummary {
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

/** Cost per million tokens: costPerHour / (tokPerSec * 3600 / 1_000_000) */
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

export interface SsrInterpolatedRow {
  target: number;
  a: InterpolatedResult | null;
  b: InterpolatedResult | null;
}

/**
 * Build GPUDataPoints for a single hwKey from raw benchmark rows, matching the
 * same transform logic as useThroughputData (but callable on the server).
 */
function buildGpuDataPoints(
  rows: BenchmarkRow[],
  hw: string,
  isl: number,
  osl: number,
  precision: string,
): GPUDataPoint[] {
  const points: GPUDataPoint[] = [];
  for (const row of rows) {
    if (row.hardware !== hw) continue;
    if (row.isl !== isl || row.osl !== osl) continue;
    if (row.precision !== precision) continue;

    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    if (!getHardwareConfig(hwKey)) continue;

    const m = row.metrics;
    const tput = m.tput_per_gpu ?? 0;
    const outputTput = m.output_tput_per_gpu ?? tput;
    const inputTput = m.input_tput_per_gpu ?? 0;
    const specs = getGpuSpecs(hwKey);
    const power = specs.power;

    points.push({
      hwKey,
      interactivity: m.median_intvty ?? 0,
      throughput: tput,
      outputThroughput: outputTput,
      inputThroughput: inputTput,
      concurrency: row.conc,
      tp: row.decode_tp,
      precision: row.precision,
      ep: row.decode_ep,
      dp_attention: row.decode_dp_attention,
      disagg: row.disagg,
      costh: computeGpuCost(specs.costh, tput),
      costn: computeGpuCost(specs.costn, tput),
      costr: computeGpuCost(specs.costr, tput),
      costhi: computeGpuCost(specs.costh, inputTput),
      costni: computeGpuCost(specs.costn, inputTput),
      costri: computeGpuCost(specs.costr, inputTput),
      costhOutput: computeGpuCost(specs.costh, outputTput),
      costnOutput: computeGpuCost(specs.costn, outputTput),
      costrOutput: computeGpuCost(specs.costr, outputTput),
      tpPerMw: power && power > 0 ? (tput * 1000) / power : 0,
      inputTpPerMw: power && power > 0 ? (inputTput * 1000) / power : 0,
      outputTpPerMw: power && power > 0 ? (outputTput * 1000) / power : 0,
    });
  }
  return points;
}

function interactivityRangeOf(pts: GPUDataPoint[]): { min: number; max: number } | null {
  if (pts.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.interactivity < min) min = p.interactivity;
    if (p.interactivity > max) max = p.interactivity;
  }
  return { min, max };
}

/**
 * Pre-compute interpolated table data for the GPU pair at several interactivity
 * levels. Picks 3 targets (25th, 50th, 75th percentile) within the overlapping
 * interactivity range of both GPUs.
 */
function computeCompareTableData(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  sequence: string | null,
  precision: string | null,
): {
  defaultTargets: number[];
  ssrRows: SsrInterpolatedRow[];
  interactivityRange: { min: number; max: number };
} {
  const empty = { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } };
  if (!sequence || !precision) return empty;

  const islOsl = sequenceToIslOsl(sequence);
  if (!islOsl) return empty;

  const pointsA = buildGpuDataPoints(rows, a, islOsl.isl, islOsl.osl, precision);
  const pointsB = buildGpuDataPoints(rows, b, islOsl.isl, islOsl.osl, precision);

  if (pointsA.length === 0 && pointsB.length === 0) return empty;

  const rangeA = interactivityRangeOf(pointsA);
  const rangeB = interactivityRangeOf(pointsB);

  // Use the overlapping range if both GPUs have data, otherwise the wider range
  let globalMin: number, globalMax: number;
  if (rangeA && rangeB) {
    globalMin = Math.max(rangeA.min, rangeB.min);
    globalMax = Math.min(rangeA.max, rangeB.max);
    // If no overlap, fall back to union
    if (globalMin >= globalMax) {
      globalMin = Math.min(rangeA.min, rangeB.min);
      globalMax = Math.max(rangeA.max, rangeB.max);
    }
  } else {
    const r = rangeA ?? rangeB!;
    globalMin = r.min;
    globalMax = r.max;
  }

  const interactivityRange = {
    min: Math.ceil(globalMin),
    max: Math.floor(globalMax),
  };

  // Pick 3 target levels at 25th, 50th, 75th percentile
  const span = globalMax - globalMin;
  const defaultTargets =
    span > 0
      ? [
          Math.round(globalMin + span * 0.25),
          Math.round(globalMin + span * 0.5),
          Math.round(globalMin + span * 0.75),
        ]
      : [Math.round(globalMin)];

  const ssrRows: SsrInterpolatedRow[] = defaultTargets.map((target) => ({
    target,
    a:
      pointsA.length > 0
        ? interpolateForGPU(pointsA, target, 'interactivity_to_throughput', 'costh')
        : null,
    b:
      pointsB.length > 0
        ? interpolateForGPU(pointsB, target, 'interactivity_to_throughput', 'costh')
        : null,
  }));

  return { defaultTargets, ssrRows, interactivityRange };
}

function jsonLdEntryFor(key: string, summary: PairSummary, position: number) {
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
}

function buildJsonLd(
  model: CompareModelSlug,
  a: string,
  b: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
  ssrRows: SsrInterpolatedRow[],
) {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  const fullLabel = compareModelDisplayLabel(model, a, b);

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: 'Model', value: model.displayName },
        { name: 'Target Interactivity (tok/s/user)', value: String(row.target) },
      ];
      if (row.a) {
        metrics.push(
          { name: `${aLabel} Throughput (tok/s/gpu)`, value: row.a.value.toFixed(1) },
          { name: `${aLabel} Cost ($/M tok)`, value: row.a.cost.toFixed(3) },
          { name: `${aLabel} tok/s/MW`, value: row.a.tpPerMw.toFixed(0) },
          { name: `${aLabel} Concurrency`, value: String(Math.round(row.a.concurrency)) },
        );
      }
      if (row.b) {
        metrics.push(
          { name: `${bLabel} Throughput (tok/s/gpu)`, value: row.b.value.toFixed(1) },
          { name: `${bLabel} Cost ($/M tok)`, value: row.b.cost.toFixed(3) },
          { name: `${bLabel} tok/s/MW`, value: row.b.tpPerMw.toFixed(0) },
          { name: `${bLabel} Concurrency`, value: String(Math.round(row.b.concurrency)) },
        );
      }
      return {
        '@type': 'Observation',
        name: `${model.label} comparison at ${row.target} tok/s/user interactivity`,
        variableMeasured: metrics.map((m) => ({
          '@type': 'PropertyValue',
          name: m.name,
          value: m.value,
        })),
      };
    });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: `${fullLabel} Inference Benchmark`,
        description: `Head-to-head AI inference benchmark comparison of ${aLabel} and ${bLabel} on ${model.label} across LLM workloads.`,
        url,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: 2,
        itemListElement: [jsonLdEntryFor(a, summaryA, 1), jsonLdEntryFor(b, summaryB, 2)],
      },
      ...(comparisonRows.length > 0
        ? [
            {
              '@type': 'Dataset',
              name: `${aLabel} vs ${bLabel} (${model.label}) Interpolated Benchmark Comparison`,
              description: `Interpolated throughput, cost, power efficiency, and concurrency for ${aLabel} and ${bLabel} on ${model.label} at matched interactivity levels.`,
              url,
              hasPart: comparisonRows,
            },
          ]
        : []),
    ],
  };
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  // Await searchParams once so we can both preserve them on redirect and read
  // them for URL-param overrides further down.
  const sp = await searchParams;

  // One-hop redirect to the fully canonical URL. Handles all three normalization
  // cases in a single 308:
  //   - legacy bare slug:   `h100-vs-h200`              → `deepseek-r1-h100-vs-h200`
  //   - alias model:        `kimi-h100-vs-h200`         → `kimi-k26-h100-vs-h200`
  //   - non-canonical GPUs: `kimi-k26-h200-vs-h100`     → `kimi-k26-h100-vs-h200`
  //   - any combination of the above
  // Preserves the query string so `?i_seq=1k/1k&i_prec=fp8` etc. survive the
  // redirect — the original PR #351 redirect dropped these, but with bare slugs
  // now redirecting unconditionally we need to keep them.
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  if (canonical !== slug) {
    const qs = Object.entries(sp)
      .flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((vv) => [k, vv] as const);
        if (v === undefined) return [];
        return [[k, v] as const];
      })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    // 308 (not 307): bare-slug, alias model, and non-canonical GPU order are
    // all permanent decisions — using a permanent redirect lets search engines
    // consolidate link equity onto the canonical URL instead of keeping the
    // alias URL in the index alongside the canonical one.
    permanentRedirect(`/compare/${canonical}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const summaryA = summarize(rows, parsed.a);
  const summaryB = summarize(rows, parsed.b);
  const { sequence: pickedSequence, precision: pickedPrecision } = pickPairDefaults(
    rows,
    parsed.a,
    parsed.b,
  );

  // URL params win over slug-derived defaults; this baking-into-SSR avoids the
  // hydration flash where the client upgrades seeded defaults to URL values.
  // `sp` was already awaited above for the redirect-query-preservation path.
  const urlSeq = pickString(sp.i_seq);
  const urlPrec = pickString(sp.i_prec);
  const urlModel = pickString(sp.g_model);
  const effectiveSequence = urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence;
  const effectivePrecision = urlPrec && KNOWN_PRECISIONS.has(urlPrec) ? urlPrec : pickedPrecision;
  // `?g_model=` is honored only if it matches a known model — but the slug's
  // model is the canonical default. Disregard URL param if user wants to
  // explicitly override (rare).
  const effectiveModel =
    urlModel && KNOWN_MODELS.has(urlModel) ? urlModel : parsed.model.displayName;

  const { defaultTargets, ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    parsed.a,
    parsed.b,
    effectiveSequence,
    effectivePrecision,
  );

  const url = `${SITE_URL}/compare/${canonical}`;
  const jsonLd = buildJsonLd(parsed.model, parsed.a, parsed.b, url, summaryA, summaryB, ssrRows);
  const label = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const aMeta = HW_REGISTRY[parsed.a];
  const bMeta = HW_REGISTRY[parsed.b];

  return (
    <>
      <JsonLd data={jsonLd} />
      <ComparePageClient
        a={parsed.a}
        b={parsed.b}
        label={label}
        modelLabel={parsed.model.label}
        defaultModel={effectiveModel}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        aLabel={aMeta?.label ?? parsed.a.toUpperCase()}
        bLabel={bMeta?.label ?? parsed.b.toUpperCase()}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
      />
    </>
  );
}
