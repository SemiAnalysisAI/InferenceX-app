import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { AGENTIC_SCENARIO_INTRO_ZH } from '@/lib/compare-ssr-zh';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare-scenario-route';
import { getCachedBenchmarks, KNOWN_SEQUENCES, pickString } from '@/lib/compare-ssr';
import {
  canonicalPrecisionCompareSlug,
  parsePrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare-variant-slug';
import {
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
} from '@/lib/compare-variant-ssr';
import {
  buildVariantBreadcrumbJsonLdZh,
  buildVariantJsonLdZh,
  variantCompareNarrativeZh,
} from '@/lib/compare-variant-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

import ComparePrecisionPageClient from '../../../compare-precision/[slug]/page-client';

export const dynamic = 'force-dynamic';

/**
 * `/zh/compare-precision/<slug>/<scenario>` renders this same page with the workload
 * pinned by the path. The segment is threaded through rather than duplicated
 * in a parallel route file so the body — redirects, JSON-LD, metadata, client
 * props — is written once and cannot drift between the two URLs.
 */
export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

/** English twin of `scenarioPath` — hreflang pairs are keyed off the
 *  English route, so the segment has to survive the locale swap. */
function enScenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/compare-precision/${canonical}/${scenarioSegment}`
    : `/compare-precision/${canonical}`;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/zh/compare-precision/${canonical}/${scenarioSegment}`
    : `/zh/compare-precision/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildPrecisionMetadataZh(slug, {});
}

export function buildPrecisionMetadataZh(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Metadata {
  const parsed = parsePrecisionCompareSlug(slug);
  if (!parsed) return {};
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);
  const canonical = canonicalPrecisionCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precA,
    parsed.precB,
  );
  // The scenario segments are views of one comparison, so the bare slug URL
  // stays the indexable representative and every segment canonicalizes to it.
  // Without this, `/…/<slug>/<default-scenario>` and `/…/<slug>` would serve
  // byte-identical pages, each claiming to be canonical.
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const description = `${gpuLabel} 上 ${aLabel} 与 ${bLabel} 精度对比（${parsed.model.label}）：来自 InferenceX（SemiAnalysis 推出的独立开源基准测试平台）的经验证、可复现的结果。${SUPPORTERS_LINE_ZH}查看哪种量化精度在各交互性水平下吞吐量和成本更优。`;
  return {
    title: `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel} — 精度对比`,
    description,
    alternates: zhAlternates(enScenarioPath(canonical)),
    openGraph: {
      title: `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel} — 精度对比 | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel} — 精度对比`,
      description,
    },
  };
}

export default async function ComparePrecisionPageZh({ params, searchParams }: Props) {
  const { slug } = await params;
  return renderPrecisionPageZh(slug, await searchParams, {});
}

export async function renderPrecisionPageZh(
  slug: string,
  sp: Record<string, string | string[] | undefined>,
  { scenarioSegment }: ScenarioOptions,
) {
  const parsed = parsePrecisionCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalPrecisionCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precA,
    parsed.precB,
  );
  if (canonical !== slug.toLowerCase()) {
    const qs = Object.entries(sp)
      .flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((vv) => [k, vv] as const);
        if (v === undefined) return [];
        return [[k, v] as const];
      })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    // Keep the scenario segment across the redirect — dropping it would send
    // the reader to the pair's default workload instead.
    permanentRedirect(`${scenarioPath(canonical, scenarioSegment)}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const sideA = { precision: parsed.precA };
  const sideB = { precision: parsed.precB };

  const { sequence: pickedSequence } = pickVariantPairDefaults(
    'precision',
    rows,
    parsed.gpu,
    sideA,
    sideB,
  );

  const urlSeq = pickString(sp.i_seq);
  // Path beats query beats the pair's default: a scenario segment is an
  // explicit address for one workload, so it outranks a stale `?i_seq=`.
  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const effectiveSequence =
    pathSequence ?? (urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence);

  const { defaultTargets, ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    parsed.gpu,
    effectiveSequence,
    sideA,
    sideB,
  );

  const summaryA = summarizeVariantSide(rows, parsed.gpu, sideA);
  const summaryB = summarizeVariantSide(rows, parsed.gpu, sideB);

  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  // The PNG route exists only under the EN tree; zh JSON-LD references it there.
  const imageUrl = `${SITE_URL}/compare-precision/${canonical}/precision-comparison.png`;
  const { oldest, newest } = dateRangeForVariantPair(rows, parsed.gpu, sideA, sideB);
  const jsonLd = buildVariantJsonLdZh(
    'precision',
    parsed.model,
    parsed.gpu,
    aLabel,
    bLabel,
    url,
    summaryA,
    summaryB,
    ssrRows,
    imageUrl,
    oldest,
    newest,
  );
  const pairLabel = `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel}`;
  const breadcrumbJsonLd = buildVariantBreadcrumbJsonLdZh('precision', pairLabel, url);
  const narrative = variantCompareNarrativeZh(
    'precision',
    parsed.model.label,
    gpuLabel,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ComparePrecisionPageClient
        gpu={parsed.gpu}
        slug={canonical}
        modelLabel={parsed.model.label}
        defaultModel={parsed.model.displayName}
        defaultSequence={effectiveSequence}
        precA={parsed.precA}
        precB={parsed.precB}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        narrative={narrative}
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO_ZH : null}
        gpuLabel={gpuLabel}
        gpuVendor={gpuMeta?.vendor ?? ''}
        gpuArch={gpuMeta?.arch ?? ''}
        aLabel={aLabel}
        bLabel={bLabel}
        heroImageSrc={`/compare-precision/${canonical}/precision-comparison.png`}
        locale="zh"
      />
    </>
  );
}
