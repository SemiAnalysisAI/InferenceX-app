import type { NextRequest } from 'next/server';

import { GPU_KEYS, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { cachedJson } from '@/lib/api-cache';
import { comparisonScenarioForModel } from '@/lib/compare-agentx';
import { getComparePageDerivedData } from '@/lib/compare-page-data.server';
import {
  canonicalCompareSlug,
  COMPARE_MODEL_SLUGS,
  getModelSlugEntryForDisplayName,
  parseCompareSlug,
  type CompareModelSlug,
} from '@/lib/compare-slug';
import { computeCompareStat } from '@/lib/compare-ssr';
import { Sequence } from '@/lib/data-mappings';
import {
  buildCompareTable,
  buildPrecisionBreakdown,
  buildSpecDecodeBreakdown,
  COMPARE_VARIANTS,
  compareRowsAtTiers,
  compareViewCsvRows,
  projectCompareStat,
} from '@/lib/views-api/compare-view';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  parseEnumParam,
  parseFormatParam,
  parseSequenceParam,
  resolveModelParam,
} from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/compare — JSON form of the /compare/<slug> pages.
 *
 * Pair selection accepts either the page slug (`slug=deepseek-v4-b200-vs-mi355x`)
 * or `model=` + `gpus=<a>,<b>`; both are canonicalized the way the pages
 * redirect, so the two spellings of a pair return identical payloads. All
 * interpolation reuses `lib/compare-page-data.server.ts` / `lib/compare-ssr.ts`.
 */

const MAX_CUSTOM_TIERS = 12;

function parseTiersParam(value: string | null): number[] | null {
  if (!value) return null;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_CUSTOM_TIERS) {
    throw new ViewsApiParamError(
      'tiers',
      `tiers must be 1-${MAX_CUSTOM_TIERS} comma-separated positive interactivity targets`,
    );
  }
  const tiers = parts.map((part) => {
    const tier = Number(part);
    if (!Number.isFinite(tier) || tier <= 0) {
      throw new ViewsApiParamError('tiers', `Invalid tier: ${part}`);
    }
    return tier;
  });
  return [...new Set(tiers)].toSorted((left, right) => left - right);
}

interface ResolvedPair {
  modelEntry: CompareModelSlug;
  a: string;
  b: string;
}

function resolvePair(searchParams: URLSearchParams): ResolvedPair {
  const slugParam = searchParams.get('slug');
  let modelEntry: CompareModelSlug;
  let a: string;
  let b: string;
  if (slugParam) {
    const parsed = parseCompareSlug(slugParam.toLowerCase());
    if (!parsed) {
      throw new ViewsApiParamError(
        'slug',
        `Unknown compare slug: ${slugParam}. Expected <model>-<gpuA>-vs-<gpuB>, e.g. deepseek-v4-b200-vs-mi355x.`,
      );
    }
    ({ a, b } = parsed);
    modelEntry = parsed.model;
  } else {
    const modelParam = searchParams.get('model');
    const gpusParam = searchParams.get('gpus');
    if (!modelParam || !gpusParam) {
      throw new ViewsApiParamError(
        'slug',
        'Provide slug=<model>-<gpuA>-vs-<gpuB>, or model= plus gpus=<gpuA>,<gpuB>.',
      );
    }
    const resolved = resolveModelParam(modelParam);
    const entry = getModelSlugEntryForDisplayName(resolved.displayName);
    if (!entry) {
      throw new ViewsApiParamError(
        'model',
        `No compare view for model: ${modelParam}`,
        COMPARE_MODEL_SLUGS.map((candidate) => candidate.slug),
      );
    }
    const gpus = gpusParam
      .split(',')
      .map((gpu) => gpu.trim().toLowerCase())
      .filter(Boolean);
    if (gpus.length !== 2 || gpus[0] === gpus[1]) {
      throw new ViewsApiParamError('gpus', 'gpus must list exactly 2 distinct GPU base keys');
    }
    for (const gpu of gpus) {
      if (!GPU_KEYS.has(gpu)) {
        throw new ViewsApiParamError('gpus', `Unknown gpu: ${gpu}`, [...GPU_KEYS].toSorted());
      }
    }
    modelEntry = entry;
    [a, b] = gpus;
  }
  // Canonicalize GPU order exactly like the page redirect so both spellings
  // of a pair produce one payload (summary sides included).
  const canonical = parseCompareSlug(canonicalCompareSlug(modelEntry.slug, a, b));
  if (canonical) ({ a, b } = canonical);
  return { modelEntry, a, b };
}

export function GET(request: NextRequest) {
  return runViewsRoute('compare', async () => {
    const searchParams = request.nextUrl.searchParams;
    const { modelEntry, a, b } = resolvePair(searchParams);
    const scenarioParam = searchParams.get('scenario');
    const requestedSequence = scenarioParam
      ? parseSequenceParam(scenarioParam, Sequence.EightK_OneK, 'scenario')
      : null;
    const variant = parseEnumParam(
      searchParams.get('variant'),
      'variant',
      COMPARE_VARIANTS,
      'default',
    );
    const customTiers = parseTiersParam(searchParams.get('tiers'));
    const format = parseFormatParam(searchParams.get('format'));

    const fallbackSequence = comparisonScenarioForModel(modelEntry).sequence;
    const derived = await getComparePageDerivedData(
      modelEntry.dbKeys,
      a,
      b,
      requestedSequence,
      null,
      fallbackSequence,
    );
    const rows = derived.initialPairBenchmarkRows;

    const ssrRows =
      customTiers && derived.sequence && derived.precision
        ? compareRowsAtTiers(
            rows,
            a,
            b,
            derived.sequence,
            derived.precision,
            derived.interactivityRange,
            customTiers,
          )
        : derived.ssrRows;
    const table = buildCompareTable(ssrRows, variant, a, b);
    const tiers = table.map((row) => row.tier);

    if (format === 'csv') {
      return csvResponse(compareViewCsvRows(table, modelEntry.displayName, a, b, derived.sequence));
    }

    const summary: Record<string, unknown> = {
      a: derived.summaryA,
      b: derived.summaryB,
      // Head-to-head is always read at the page's default targets so it stays
      // stable regardless of any custom tiers requested for the table.
      headToHead: projectCompareStat(computeCompareStat(a, b, derived.ssrRows)),
    };
    if (variant === 'precision' && derived.sequence) {
      summary.byPrecision = buildPrecisionBreakdown(rows, a, b, derived.sequence);
    }
    if (variant === 'spec-decode') {
      const islOsl = derived.sequence ? sequenceToIslOsl(derived.sequence) : null;
      summary.bySpecDecode =
        islOsl && derived.precision
          ? buildSpecDecodeBreakdown(
              rows,
              a,
              b,
              islOsl.isl,
              islOsl.osl,
              derived.precision,
              tiers.length > 0 ? tiers : derived.defaultTargets,
            )
          : [];
    }

    return cachedJson({
      view: 'compare',
      apiVersion: 'v1',
      generatedAt: derived.newest ?? null,
      params: {
        slug: canonicalCompareSlug(modelEntry.slug, a, b),
        model: modelEntry.displayName,
        gpus: [a, b],
        scenario: requestedSequence ?? 'auto',
        variant,
        tiers: customTiers ?? 'default',
        format,
      },
      model: {
        slug: modelEntry.slug,
        displayName: modelEntry.displayName,
        label: modelEntry.label,
      },
      gpus: [a, b],
      scenario: derived.sequence,
      precision: derived.precision,
      variant,
      tiers,
      interactivityRange: derived.interactivityRange,
      dataRange: { oldest: derived.oldest ?? null, newest: derived.newest ?? null },
      table,
      summary,
    });
  });
}
